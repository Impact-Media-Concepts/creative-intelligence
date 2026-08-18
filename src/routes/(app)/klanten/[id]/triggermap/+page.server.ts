import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { bouwIntakeTekst, genereerTriggerMap } from '$lib/server/trigger-map-generator';
import { genereerInvalshoekScores } from '$lib/server/scoring-ai';
import { CLAUDE_MODEL } from '$lib/server/claude';
import { BRON1_DREMPEL } from '$lib/intake-vragen';
import { heeftInhoud } from '$lib/progress';
import type { Invalshoek } from '$lib/trigger-map';
import type { Json } from '$lib/supabase/database.types';

// AI-generatie met adaptive thinking duurt langer; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

/** Voldoende Bron 1-input om een zinnige trigger map te genereren (drempel, niet alles). */
function bron1Volledig(rows: Array<{ vraag_nummer: number; antwoord: string | null }>): boolean {
	const aantal = rows.filter((r) => r.vraag_nummer > 0 && heeftInhoud(r.antwoord)).length;
	return aantal >= BRON1_DREMPEL;
}

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const id = params.id;

	const [b1, versies] = await Promise.all([
		supabase.from('intake_bron1').select('vraag_nummer, antwoord').eq('client_id', id),
		supabase
			.from('trigger_map_versions')
			.select('*')
			.eq('client_id', id)
			.order('versie_nummer', { ascending: false })
	]);

	return {
		bron1Compleet: bron1Volledig(b1.data ?? []),
		versies: versies.data ?? []
	};
};

export const actions: Actions = {
	genereren: async ({ params, locals: { supabase, user } }) => {
		const id = params.id;

		const [b1, b2, b3, b4, b5, b6] = await Promise.all([
			supabase.from('intake_bron1').select('vraag_nummer, antwoord').eq('client_id', id),
			supabase.from('intake_bron2').select('vraag_nummer, antwoord').eq('client_id', id),
			supabase.from('intake_bron3_concurrenten').select('*').eq('client_id', id),
			supabase.from('intake_bron4').select('platform, bron_naam, ruwe_tekst').eq('client_id', id),
			supabase
				.from('intake_bron5')
				.select('beste_advertenties, best_verkopende_producten, search_console, organische_posts')
				.eq('client_id', id)
				.maybeSingle(),
			supabase.from('intake_bron6').select('titel, inhoud').eq('client_id', id)
		]);

		if (!bron1Volledig(b1.data ?? [])) {
			return fail(400, {
				foutmelding: `Vul eerst minimaal ${BRON1_DREMPEL} vragen van Bron 1 (Klantgesprek) in.`
			});
		}

		const intakeTekst = bouwIntakeTekst({
			bron1: b1.data ?? [],
			bron2: b2.data ?? [],
			bron3: b3.data ?? [],
			bron4: b4.data ?? [],
			bron5: b5.data ?? null,
			bron6: b6.data ?? []
		});

		try {
			const res = await genereerTriggerMap(intakeTekst);

			// Elke AI-call loggen (principe #4).
			await supabase.from('ai_logs').insert({
				client_id: id,
				gebruiker_id: user!.id,
				module: 'trigger_map',
				model: res.model,
				prompt: res.prompt,
				response: res.response,
				tokens_input: res.tokensInput,
				tokens_output: res.tokensOutput,
				duur_ms: res.duurMs
			});

			// Volgende versienummer bepalen.
			const { data: laatste } = await supabase
				.from('trigger_map_versions')
				.select('versie_nummer')
				.eq('client_id', id)
				.order('versie_nummer', { ascending: false })
				.limit(1)
				.maybeSingle();
			const volgende = (laatste?.versie_nummer ?? 0) + 1;

			// Oude versies deactiveren, nieuwe als actief opslaan (oude blijft bewaard).
			await supabase
				.from('trigger_map_versions')
				.update({ is_actief: false })
				.eq('client_id', id)
				.eq('is_actief', true);

			const { data: nieuweVersie, error: insErr } = await supabase
				.from('trigger_map_versions')
				.insert({
					client_id: id,
					versie_nummer: volgende,
					is_actief: true,
					pijnpunten: res.data.pijnpunten,
					wensen: res.data.wensen,
					bezwaren: res.data.bezwaren,
					taal_doelgroep: res.data.taal_doelgroep,
					routines: res.data.routines,
					kansen_vs_concurrenten: res.data.kansen_vs_concurrenten,
					personas: (res.data.personas ?? []) as unknown as Json,
					invalshoeken: res.data.invalshoeken as unknown as Json,
					gegenereerd_door: user!.id
				})
				.select('id')
				.single();
			if (insErr || !nieuweVersie) {
				return fail(500, { foutmelding: 'Opslaan mislukt: ' + (insErr?.message ?? '') });
			}

			// Invalshoeken meteen automatisch scoren (RICE-light) zodat de test-backlog in de
			// matrix direct geprioriteerd is. Best-effort: de trigger map is hierboven al
			// opgeslagen, dus als dit mislukt of te lang duurt, blijven de invalshoeken gewoon
			// (ongescoord) staan en kan de strateeg ze later vanuit de matrix laten scoren.
			try {
				const teScoren = (res.data.invalshoeken as Invalshoek[]).filter((i) => !i.gearchiveerd);
				if (teScoren.length) {
					const scoreRes = await genereerInvalshoekScores({
						invalshoeken: teScoren.map((i) => ({
							naam: i.naam,
							omschrijving: i.omschrijving,
							onderbouwing: i.onderbouwing,
							funnelfase: i.funnelfase
						})),
						personas: res.data.personas ?? [],
						pijnpunten: res.data.pijnpunten,
						wensen: res.data.wensen,
						bezwaren: res.data.bezwaren,
						kansen_vs_concurrenten: res.data.kansen_vs_concurrenten
					});

					await supabase.from('ai_logs').insert({
						client_id: id,
						gebruiker_id: user!.id,
						module: 'scorekaart',
						model: scoreRes.model,
						prompt: scoreRes.prompt,
						response: scoreRes.response,
						tokens_input: scoreRes.tokensInput,
						tokens_output: scoreRes.tokensOutput,
						duur_ms: scoreRes.duurMs
					});

					// Scores koppelen op genormaliseerde naam (strip [FASE]-prefix, case/spaties).
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/^\s*\[[^\]]*\]\s*/, '')
							.trim()
							.toLowerCase();
					const perNaam = new Map(scoreRes.data.scores.map((s) => [norm(s.naam), s]));
					const gescoord = (res.data.invalshoeken as Invalshoek[]).map((i) => {
						const s = perNaam.get(norm(i.naam));
						return s
							? {
									...i,
									score: {
										bereik: s.bereik,
										impact: s.impact,
										bewijskracht: s.bewijskracht,
										effort: s.effort,
										toelichting: s.toelichting
									}
								}
							: i;
					});
					await supabase
						.from('trigger_map_versions')
						.update({ invalshoeken: gescoord as unknown as Json })
						.eq('id', nieuweVersie.id);
				}
			} catch (e) {
				await supabase.from('ai_logs').insert({
					client_id: id,
					gebruiker_id: user!.id,
					module: 'scorekaart',
					model: CLAUDE_MODEL,
					response: 'FOUT (auto-score bij generatie): ' + (e instanceof Error ? e.message : 'onbekend')
				});
			}

			// Fase laten oplichten in de Creative Loop.
			const { data: client } = await supabase
				.from('clients')
				.select('huidige_fase')
				.eq('id', id)
				.single();
			if (client?.huidige_fase === 'intake') {
				await supabase.from('clients').update({ huidige_fase: 'trigger_map' }).eq('id', id);
			}

			return { ok: true, versie: volgende };
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'onbekende fout';
			// Ook mislukte calls loggen.
			await supabase.from('ai_logs').insert({
				client_id: id,
				gebruiker_id: user!.id,
				module: 'trigger_map',
				model: CLAUDE_MODEL,
				prompt: intakeTekst,
				response: 'FOUT: ' + msg
			});
			return fail(500, { foutmelding: 'Genereren mislukt: ' + msg });
		}
	}
};
