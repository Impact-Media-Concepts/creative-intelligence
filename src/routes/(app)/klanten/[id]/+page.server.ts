import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { berekenIntakeProgress, heeftInhoud, bron2Ingevuld } from '$lib/progress';
import { STATUSSEN, type Status } from '$lib/config';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const id = params.id;

	const [b1, b2, b3, b4, b5, tm, concepten] = await Promise.all([
		supabase.from('intake_bron1').select('antwoord').eq('client_id', id),
		supabase.from('intake_bron2').select('vraag_nummer, antwoord').eq('client_id', id),
		supabase.from('intake_bron3_concurrenten').select('id').eq('client_id', id),
		supabase.from('intake_bron4').select('ruwe_tekst').eq('client_id', id),
		supabase
			.from('intake_bron5')
			.select('beste_advertenties, best_verkopende_producten, search_console, organische_posts')
			.eq('client_id', id)
			.maybeSingle(),
		supabase
			.from('trigger_map_versions')
			.select('invalshoeken')
			.eq('client_id', id)
			.eq('is_actief', true)
			.maybeSingle(),
		supabase
			.from('concepts')
			.select('status, gearchiveerd, is_winnaar, hook_rate, hold_rate, ctr, roas, cpa, observatie, ai_analyse')
			.eq('client_id', id)
	]);

	const b5row = b5.data;
	const bron5Ingevuld = b5row
		? [
				b5row.beste_advertenties,
				b5row.best_verkopende_producten,
				b5row.search_console,
				b5row.organische_posts
			].filter((v) => heeftInhoud(v)).length
		: 0;

	const progress = berekenIntakeProgress({
		bron1Ingevuld: (b1.data ?? []).filter((r) => heeftInhoud(r.antwoord)).length,
		bron2Ingevuld: bron2Ingevuld(b2.data),
		bron3Aantal: (b3.data ?? []).length,
		bron4Ingevuld: (b4.data ?? []).filter((r) => heeftInhoud(r.ruwe_tekst)).length,
		bron5Ingevuld
	});

	// ---- Reis-overzicht (dashboard + volgende stap) ----
	const heeftTriggerMap = !!tm.data;
	const invalshoeken = Array.isArray(tm.data?.invalshoeken)
		? (tm.data.invalshoeken as Array<{ gearchiveerd?: boolean }>).filter((i) => !i.gearchiveerd).length
		: 0;
	const alleConcepten = concepten.data ?? [];
	const actieveConcepten = alleConcepten.filter((c) => !c.gearchiveerd);
	const live = actieveConcepten.filter((c) => c.status === 'Live').length;
	const winnaars = alleConcepten.filter((c) => c.is_winnaar).length;
	const getest = alleConcepten.filter(
		(c) =>
			c.is_winnaar ||
			c.hook_rate != null ||
			c.hold_rate != null ||
			c.ctr != null ||
			c.roas != null ||
			c.cpa != null ||
			heeftInhoud(c.observatie) ||
			!!c.ai_analyse
	).length;

	const reis = {
		intakePct: progress.totaal,
		heeftTriggerMap,
		invalshoeken,
		concepten: actieveConcepten.length,
		live,
		winnaars,
		getest
	};

	// Eén duidelijke volgende actie, afgeleid van waar de klant staat.
	let volgendeStap: { label: string; hint: string; tab: string };
	if (!heeftTriggerMap) {
		volgendeStap =
			progress.totaal < 25
				? {
						label: 'Begin met de intake',
						hint: 'Vul de bronnen zo volledig mogelijk in — hoe beter de intake, hoe sterker alles daarna.',
						tab: 'intake'
					}
				: {
						label: 'Genereer de trigger map',
						hint: 'Zet de intake om in inzichten, persona’s en een automatisch geprioriteerde test-backlog.',
						tab: 'triggermap'
					};
	} else if (actieveConcepten.length === 0) {
		volgendeStap = {
			label: 'Stel je testset samen in de Testruimte',
			hint: 'Kies de combinaties (aanbod × invalshoek × format × creator) die je deze ronde wil testen — de tool houdt je gefocust.',
			tab: 'testruimte'
		};
	} else if (getest === 0) {
		volgendeStap = {
			label: 'Voer de sprintresultaten in',
			hint: 'Vul de metrics in en laat Claude de learning bepalen.',
			tab: 'sprint'
		};
	} else {
		volgendeStap = {
			label: 'Bekijk learnings & start de volgende ronde',
			hint: 'Markeer winnaars en bouw voort op wat werkt.',
			tab: 'learnings'
		};
	}

	return { progress, reis, volgendeStap };
};

export const actions: Actions = {
	status: async ({ request, params, locals: { supabase } }) => {
		const fd = await request.formData();
		const status = String(fd.get('status') ?? '') as Status;
		if (!STATUSSEN.includes(status)) {
			return fail(400, { foutmelding: 'Ongeldige status.' });
		}
		const { error } = await supabase.from('clients').update({ status }).eq('id', params.id);
		if (error) return fail(500, { foutmelding: error.message });
		return { ok: true };
	},

	verwijderen: async ({ params, locals: { supabase } }) => {
		const { error } = await supabase.from('clients').delete().eq('id', params.id);
		if (error) return fail(500, { foutmelding: error.message });
		throw redirect(303, '/');
	}
};
