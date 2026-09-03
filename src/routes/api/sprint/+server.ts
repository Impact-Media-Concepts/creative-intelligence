import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database, Json } from '$lib/supabase/database.types';
import { genereerBrief, analyseerResultaat, genereerVolgendeTestronde } from '$lib/server/sprint-ai';
import { CLAUDE_MODEL } from '$lib/server/claude';
import { TESTVOLGORDE } from '$lib/matrix';

type ConceptInsert = Database['public']['Tables']['concepts']['Insert'];

// AI-generatie (brief/analyse) met adaptive thinking duurt langer; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

const METRIC_KEYS = ['hook_rate', 'hold_rate', 'ctr', 'roas', 'cpa'] as const;

function num(v: unknown): number | null {
	if (v === '' || v == null) return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

async function laadConcept(
	supabase: App.Locals['supabase'],
	id: string
) {
	const { data } = await supabase.from('concepts').select('*').eq('id', id).single();
	return data;
}

async function faseNaarSprint(supabase: App.Locals['supabase'], clientId: string) {
	const { data: client } = await supabase
		.from('clients')
		.select('huidige_fase')
		.eq('id', clientId)
		.single();
	if (client && ['intake', 'trigger_map', 'matrix'].includes(client.huidige_fase)) {
		await supabase.from('clients').update({ huidige_fase: 'sprint' }).eq('id', clientId);
	}
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		case 'metrics': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const patch: Record<string, number | string | null> = {};
			for (const k of METRIC_KEYS) patch[k] = num(body[k]);
			patch.observatie = body.observatie == null ? null : String(body.observatie);

			const { data, error: dbFout } = await supabase
				.from('concepts')
				.update(patch as never)
				.eq('id', id)
				.select('client_id')
				.single();
			if (dbFout || !data) error(500, dbFout?.message ?? 'Opslaan mislukt');
			await faseNaarSprint(supabase, data.client_id);
			return json({ ok: true });
		}

		case 'winnaar': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const waarde = !!body.waarde;
			// Vorige status ophalen → loop-geheugen alleen bij de échte overgang bijwerken.
			const { data: vorig } = await supabase
				.from('concepts')
				.select('is_winnaar')
				.eq('id', id)
				.maybeSingle();
			const wasWinnaar = !!vorig?.is_winnaar;

			const { data: concept, error: dbFout } = await supabase
				.from('concepts')
				.update({ is_winnaar: waarde })
				.eq('id', id)
				.select('client_id, invalshoek, format, ai_analyse')
				.single();
			if (dbFout || !concept) error(500, dbFout?.message ?? 'Opslaan mislukt');

			// Loop-geheugen: alleen toevoegen bij de overgang naar winnaar (niet bij her-markeren).
			if (waarde && !wasWinnaar) {
				const { data: cl } = await supabase
					.from('clients')
					.select('loop_geheugen')
					.eq('id', concept.client_id)
					.single();
				const analyse = (concept.ai_analyse as { wat_werkte?: string } | null) ?? null;
				const datum = new Date().toISOString().slice(0, 10);
				const regel =
					`[${datum}] Winnaar: ${concept.invalshoek ?? '(invalshoek)'}` +
					(concept.format ? ` (${concept.format})` : '') +
					(analyse?.wat_werkte ? ` — ${analyse.wat_werkte}` : '');
				const bestaand = cl?.loop_geheugen ? cl.loop_geheugen.trimEnd() + '\n' : '';
				await supabase
					.from('clients')
					.update({ loop_geheugen: bestaand + regel })
					.eq('id', concept.client_id);
			}

			// Loop sluiten: een bevestigde winnaar markeert de bijbehorende invalshoek in de
			// actieve trigger map als "Getest — werkt", zodat de backlog meebeweegt met de resultaten.
			let invalshoekBijgewerkt: string | null = null;
			if (waarde && concept.invalshoek) {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/^\s*\[[^\]]*\]\s*/, '')
						.trim()
						.toLowerCase();
				const doel = norm(concept.invalshoek);
				const { data: tm } = await supabase
					.from('trigger_map_versions')
					.select('id, invalshoeken')
					.eq('client_id', concept.client_id)
					.eq('is_actief', true)
					.maybeSingle();
				const lijst = (tm?.invalshoeken as Array<Record<string, unknown>> | null) ?? [];
				let gewijzigd = false;
				const nieuw = lijst.map((i) => {
					if (norm(i.naam) === doel && i.status !== 'Getest — werkt') {
						gewijzigd = true;
						invalshoekBijgewerkt = String(i.naam ?? '');
						return { ...i, status: 'Getest — werkt' };
					}
					return i;
				});
				if (gewijzigd && tm) {
					await supabase
						.from('trigger_map_versions')
						.update({ invalshoeken: nieuw as unknown as Json })
						.eq('id', tm.id);
				}
			}
			return json({ ok: true, invalshoekBijgewerkt });
		}

		case 'brief': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const concept = await laadConcept(supabase, id);
			if (!concept) error(404, 'Concept niet gevonden');

			const { data: tm } = await supabase
				.from('trigger_map_versions')
				.select('pijnpunten, wensen, bezwaren, taal_doelgroep, invalshoeken')
				.eq('client_id', concept.client_id)
				.eq('is_actief', true)
				.maybeSingle();

			try {
				const res = await genereerBrief(concept, {
					pijnpunten: (tm?.pijnpunten as string[]) ?? [],
					wensen: (tm?.wensen as string[]) ?? [],
					bezwaren: (tm?.bezwaren as string[]) ?? [],
					taal_doelgroep: (tm?.taal_doelgroep as string[]) ?? [],
					invalshoeken: (tm?.invalshoeken as Array<{ naam?: string; omschrijving?: string }>) ?? []
				});
				await supabase.from('ai_logs').insert({
					client_id: concept.client_id,
					gebruiker_id: user.id,
					module: 'creative_brief',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});
				await supabase
					.from('concepts')
					.update({ brief: res.data as unknown as Json })
					.eq('id', id);
				return json({ brief: res.data });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: concept.client_id,
					gebruiker_id: user.id,
					module: 'creative_brief',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Brief genereren mislukt: ' + msg);
			}
			break;
		}

		case 'analyse': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const concept = await laadConcept(supabase, id);
			if (!concept) error(404, 'Concept niet gevonden');

			try {
				const res = await analyseerResultaat(
					concept,
					{
						hook_rate: concept.hook_rate,
						hold_rate: concept.hold_rate,
						ctr: concept.ctr,
						roas: concept.roas,
						cpa: concept.cpa
					},
					concept.observatie
				);
				await supabase.from('ai_logs').insert({
					client_id: concept.client_id,
					gebruiker_id: user.id,
					module: 'learning',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});
				await supabase
					.from('concepts')
					.update({ ai_analyse: res.data as unknown as Json })
					.eq('id', id);
				return json({ analyse: res.data });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: concept.client_id,
					gebruiker_id: user.id,
					module: 'learning',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Analyse mislukt: ' + msg);
			}
			break;
		}

		case 'vervolg': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const bron = await laadConcept(supabase, id);
			if (!bron) error(404, 'Concept niet gevonden');

			const idx = TESTVOLGORDE.indexOf(bron.variabele as (typeof TESTVOLGORDE)[number]);
			const volgende = idx >= 0 && idx < TESTVOLGORDE.length - 1 ? TESTVOLGORDE[idx + 1] : 'Format';

			try {
				const res = await genereerVolgendeTestronde({
					winnaar: {
						funnelfase: bron.funnelfase,
						invalshoek: bron.invalshoek,
						format: bron.format,
						structuur: bron.structuur,
						creator_type: bron.creator_type,
						hypothese: bron.hypothese,
						variabele: bron.variabele
					},
					volgendeVariabele: volgende,
					metrics: {
						hook_rate: bron.hook_rate,
						hold_rate: bron.hold_rate,
						ctr: bron.ctr,
						roas: bron.roas,
						cpa: bron.cpa
					},
					observatie: bron.observatie,
					analyse: (bron.ai_analyse as { wat_werkte?: string; volgende_stap?: string } | null) ?? null
				});

				await supabase.from('ai_logs').insert({
					client_id: bron.client_id,
					gebruiker_id: user.id,
					module: 'vervolg',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				const rijen: ConceptInsert[] = res.data.concepten.map((c) => ({
					client_id: bron.client_id,
					funnelfase: c.funnelfase,
					invalshoek: c.invalshoek,
					format: c.format,
					structuur: c.structuur,
					creator_type: c.creator_type,
					hypothese: c.hypothese,
					prioriteit: c.prioriteit,
					onderbouwing: c.onderbouwing,
					variabele: volgende,
					status: 'Idee'
				}));
				const { data, error: dbFout } = await supabase.from('concepts').insert(rijen).select('*');
				if (dbFout || !data) error(500, dbFout?.message ?? 'Opslaan mislukt');
				return json({ concepten: data, volgendeVariabele: volgende });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: bron.client_id,
					gebruiker_id: user.id,
					module: 'vervolg',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Volgende testronde genereren mislukt: ' + msg);
			}
			break;
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
