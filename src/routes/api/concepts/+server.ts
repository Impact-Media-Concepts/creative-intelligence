import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/database.types';
import { FUNNELFASES, PRIORITEITEN, CONCEPT_STATUSSEN } from '$lib/matrix';
import { genereerMatrix } from '$lib/server/matrix-ai';
import { CLAUDE_MODEL } from '$lib/server/claude';
import { afgeleidePrioriteit, type InvalshoekScore } from '$lib/trigger-map';

type ConceptInsert = Database['public']['Tables']['concepts']['Insert'];

// AI-generatie met adaptive thinking duurt langer; ruimere Vercel-functietimeout.
export const config = { maxDuration: 60 };

const TEKST_VELDEN = ['invalshoek', 'format', 'structuur', 'creator_type', 'hypothese', 'variabele', 'onderbouwing'];
const FUNNEL = FUNNELFASES as string[];
const PRIO = PRIORITEITEN as string[];
const STATUS = CONCEPT_STATUSSEN as string[];

/** Beperkt en valideert een patch tot toegestane conceptvelden. */
function schoonPatch(patch: unknown): Record<string, unknown> {
	const uit: Record<string, unknown> = {};
	if (!patch || typeof patch !== 'object') return uit;
	for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
		if (TEKST_VELDEN.includes(k)) {
			uit[k] = v == null ? null : String(v);
		} else if (k === 'funnelfase') {
			uit[k] = FUNNEL.includes(v as string) ? v : null;
		} else if (k === 'prioriteit') {
			uit[k] = PRIO.includes(v as string) ? v : null;
		} else if (k === 'status') {
			if (STATUS.includes(v as string)) uit[k] = v;
		}
	}
	return uit;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		case 'insert': {
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			const rij: ConceptInsert = { client_id: clientId, ...schoonPatch(body.concept) };
			const { data, error: dbFout } = await supabase
				.from('concepts')
				.insert(rij)
				.select('*')
				.single();
			if (dbFout || !data) error(500, dbFout?.message ?? 'Aanmaken mislukt');

			// Fase laten oplichten in de Creative Loop (alleen vooruit).
			const { data: client } = await supabase
				.from('clients')
				.select('huidige_fase')
				.eq('id', clientId)
				.single();
			if (client && (client.huidige_fase === 'intake' || client.huidige_fase === 'trigger_map')) {
				await supabase.from('clients').update({ huidige_fase: 'matrix' }).eq('id', clientId);
			}
			return json({ concept: data });
		}

		case 'update': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const patch = schoonPatch(body.patch);
			if (Object.keys(patch).length === 0) return json({ ok: true });
			const { error: dbFout } = await supabase
				.from('concepts')
				.update(patch as never)
				.eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'dupliceer': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const { data: bron, error: leesFout } = await supabase
				.from('concepts')
				.select('*')
				.eq('id', id)
				.single();
			if (leesFout || !bron) error(404, 'Concept niet gevonden');
			const kopie: ConceptInsert = {
				client_id: bron.client_id,
				funnelfase: bron.funnelfase,
				invalshoek: bron.invalshoek,
				format: bron.format,
				structuur: bron.structuur,
				creator_type: bron.creator_type,
				hypothese: bron.hypothese,
				variabele: bron.variabele,
				prioriteit: bron.prioriteit,
				onderbouwing: bron.onderbouwing,
				status: 'Idee'
			};
			const { data, error: dbFout } = await supabase
				.from('concepts')
				.insert(kopie)
				.select('*')
				.single();
			if (dbFout || !data) error(500, dbFout?.message ?? 'Dupliceren mislukt');
			return json({ concept: data });
		}

		case 'herorden': {
			const ids: string[] = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)) : [];
			if (ids.length === 0) return json({ ok: true });
			// Volgorde = positie in de aangeleverde lijst. RLS beschermt: alleen eigen concepten.
			const resultaten = await Promise.all(
				ids.map((id, i) => supabase.from('concepts').update({ volgorde: i }).eq('id', id))
			);
			const fout = resultaten.find((r) => r.error);
			if (fout?.error) error(500, fout.error.message);
			return json({ ok: true });
		}

		case 'archiveer':
		case 'herstel': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const { error: dbFout } = await supabase
				.from('concepts')
				.update({ gearchiveerd: body.type === 'archiveer' })
				.eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'genereer': {
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');

			const richtlijnen = body.richtlijnen == null ? '' : String(body.richtlijnen);

			// Teststrategie-configuratie (scope + middelen) → stuurt de generatie.
			const rawCfg = (body.config ?? {}) as Record<string, unknown>;
			const strArr = (v: unknown) =>
				Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;
			const matrixConfig = {
				personas: strArr(rawCfg.personas),
				funnelfases: strArr(rawCfg.funnelfases),
				middelen: strArr(rawCfg.middelen)
			};

			const { data: tm } = await supabase
				.from('trigger_map_versions')
				.select('pijnpunten, wensen, bezwaren, taal_doelgroep, kansen_vs_concurrenten, personas, invalshoeken')
				.eq('client_id', clientId)
				.eq('is_actief', true)
				.maybeSingle();
			if (!tm) error(400, 'Genereer eerst een trigger map — die vormt de basis voor de matrix.');

			// Learnings uit eerdere testrondes verzamelen → zelfversterkende loop: de nieuwe
			// concepten bouwen voort op winnaars en vermijden ontkrachte invalshoeken.
			const { data: eerdere } = await supabase
				.from('concepts')
				.select('invalshoek, funnelfase, format, structuur, creator_type, is_winnaar, ai_analyse, observatie')
				.eq('client_id', clientId);
			const winnaars = (eerdere ?? [])
				.filter((c) => c.is_winnaar)
				.map((c) => {
					const a = (c.ai_analyse as { wat_werkte?: string; volgende_stap?: string } | null) ?? null;
					return {
						invalshoek: c.invalshoek,
						funnelfase: c.funnelfase,
						format: c.format,
						structuur: c.structuur,
						creator_type: c.creator_type,
						wat_werkte: a?.wat_werkte ?? null,
						volgende_stap: a?.volgende_stap ?? null,
						observatie: c.observatie
					};
				});
			const invLijst = (tm.invalshoeken as Array<{ naam?: string; status?: string }> | null) ?? [];
			const werkt = invLijst
				.filter((i) => i.status === 'Getest — werkt')
				.map((i) => i.naam ?? '')
				.filter(Boolean);
			const werktNiet = invLijst
				.filter((i) => i.status === 'Getest — werkt niet')
				.map((i) => i.naam ?? '')
				.filter(Boolean);

			try {
				const res = await genereerMatrix(
					{
						pijnpunten: (tm.pijnpunten as string[]) ?? [],
						wensen: (tm.wensen as string[]) ?? [],
						bezwaren: (tm.bezwaren as string[]) ?? [],
						taal_doelgroep: (tm.taal_doelgroep as string[]) ?? [],
						kansen_vs_concurrenten: (tm.kansen_vs_concurrenten as string[]) ?? [],
						personas:
							(tm.personas as Array<{
								naam?: string;
								omschrijving?: string;
								kernbehoefte?: string;
								kernbezwaar?: string;
							}>) ?? [],
						invalshoeken: (
							(tm.invalshoeken as Array<{
								naam?: string;
								omschrijving?: string;
								onderbouwing?: string;
								funnelfase?: string;
								status?: string;
								gearchiveerd?: boolean;
								score?: InvalshoekScore;
							}>) ?? []
						).map((i) => ({
							naam: i.naam,
							omschrijving: i.omschrijving,
							onderbouwing: i.onderbouwing,
							funnelfase: i.funnelfase,
							status: i.status,
							gearchiveerd: i.gearchiveerd,
							// Goedgekeurde prioriteit uit de scorekaart (indien gescoord) → leidend in de matrix.
							prioriteit: i.score ? afgeleidePrioriteit(i.score) : undefined
						}))
					},
					richtlijnen,
					{ winnaars, werkt, werktNiet },
					matrixConfig
				);

				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'matrix',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				const rijen: ConceptInsert[] = res.data.concepten.map((c) => ({
					client_id: clientId,
					funnelfase: c.funnelfase,
					invalshoek: c.invalshoek,
					format: c.format,
					structuur: c.structuur,
					creator_type: c.creator_type,
					hypothese: c.hypothese,
					variabele: c.variabele,
					prioriteit: c.prioriteit,
					onderbouwing: c.onderbouwing,
					status: 'Idee'
				}));
				const { data, error: dbFout } = await supabase.from('concepts').insert(rijen).select('*');
				if (dbFout || !data) error(500, dbFout?.message ?? 'Opslaan mislukt');

				const { data: client } = await supabase
					.from('clients')
					.select('huidige_fase')
					.eq('id', clientId)
					.single();
				if (client && ['intake', 'trigger_map'].includes(client.huidige_fase)) {
					await supabase.from('clients').update({ huidige_fase: 'matrix' }).eq('id', clientId);
				}
				return json({ concepten: data });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'matrix',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Matrix genereren mislukt: ' + msg);
			}
			break;
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
