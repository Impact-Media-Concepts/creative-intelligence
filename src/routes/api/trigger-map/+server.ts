import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TRIGGER_MAP_SECTIES, INVALSHOEK_STATUSSEN, SCORE_NIVEAUS } from '$lib/trigger-map';
import { genereerInvalshoekScores } from '$lib/server/scoring-ai';
import { CLAUDE_MODEL } from '$lib/server/claude';

// AI-scoring van de invalshoeken; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

const SECTIE_KEYS = TRIGGER_MAP_SECTIES.map((s) => s.key) as string[];
const FUNNELFASES = ['TOFU', 'MOFU', 'BOFU'];
const STATUSSEN = INVALSHOEK_STATUSSEN as string[];
const NIVEAUS = SCORE_NIVEAUS as string[];

/** Behoudt een geldige RICE-light score uit onbetrouwbare invoer; anders undefined. */
function schoonScore(s: unknown): Record<string, unknown> | undefined {
	if (!s || typeof s !== 'object') return undefined;
	const o = s as Record<string, unknown>;
	const niveau = (v: unknown) => (NIVEAUS.includes(v as string) ? v : undefined);
	const bereik = niveau(o.bereik);
	const impact = niveau(o.impact);
	const bewijskracht = niveau(o.bewijskracht);
	const effort = niveau(o.effort);
	if (!bereik || !impact || !bewijskracht || !effort) return undefined;
	return { bereik, impact, bewijskracht, effort, toelichting: String(o.toelichting ?? '') };
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		case 'sectie': {
			const versieId = String(body.versieId ?? '');
			const key = String(body.key ?? '');
			if (!versieId || !SECTIE_KEYS.includes(key)) error(400, 'Ongeldige sectie');
			const items = Array.isArray(body.items)
				? body.items.map((x: unknown) => String(x).trim()).filter(Boolean)
				: [];
			const { error: dbFout } = await supabase
				.from('trigger_map_versions')
				.update({ [key]: items } as never)
				.eq('id', versieId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'invalshoeken': {
			const versieId = String(body.versieId ?? '');
			if (!versieId) error(400, 'Ontbrekend id');
			const raw = Array.isArray(body.invalshoeken) ? body.invalshoeken : [];
			const schoon = raw.map((x: Record<string, unknown>) => {
				const score = schoonScore(x?.score);
				return {
					naam: String(x?.naam ?? ''),
					omschrijving: String(x?.omschrijving ?? ''),
					funnelfase: FUNNELFASES.includes(x?.funnelfase as string) ? x.funnelfase : 'TOFU',
					onderbouwing: String(x?.onderbouwing ?? ''),
					status: STATUSSEN.includes(x?.status as string) ? x.status : 'Nieuw',
					gearchiveerd: !!x?.gearchiveerd,
					...(score ? { score } : {})
				};
			});
			const { error: dbFout } = await supabase
				.from('trigger_map_versions')
				.update({ invalshoeken: schoon } as never)
				.eq('id', versieId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'scores': {
			const clientId = String(body.clientId ?? '');
			const versieId = String(body.versieId ?? '');
			if (!clientId || !versieId) error(400, 'Ongeldig verzoek');

			const { data: versie } = await supabase
				.from('trigger_map_versions')
				.select('pijnpunten, wensen, bezwaren, kansen_vs_concurrenten, personas, invalshoeken')
				.eq('id', versieId)
				.maybeSingle();
			if (!versie) error(404, 'Versie niet gevonden');

			type Inv = Record<string, unknown>;
			const invalshoeken = (versie.invalshoeken as Inv[] | null) ?? [];
			const teScoren = invalshoeken.filter((i) => !i.gearchiveerd);
			if (teScoren.length === 0) error(400, 'Geen invalshoeken om te scoren.');

			try {
				const res = await genereerInvalshoekScores({
					invalshoeken: teScoren.map((i) => ({
						naam: i.naam as string,
						omschrijving: i.omschrijving as string,
						onderbouwing: i.onderbouwing as string,
						funnelfase: i.funnelfase as string
					})),
					personas: (versie.personas as Inv[] | null) ?? [],
					pijnpunten: (versie.pijnpunten as string[]) ?? [],
					wensen: (versie.wensen as string[]) ?? [],
					bezwaren: (versie.bezwaren as string[]) ?? [],
					kansen_vs_concurrenten: (versie.kansen_vs_concurrenten as string[]) ?? []
				});

				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'scorekaart',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				// Scores koppelen op genormaliseerde naam (strip een eventuele [FASE]-prefix, case/spaties).
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/^\s*\[[^\]]*\]\s*/, '')
						.trim()
						.toLowerCase();
				const perNaam = new Map(res.data.scores.map((s) => [norm(s.naam), s]));
				const bijgewerkt = invalshoeken.map((i) => {
					const s = perNaam.get(norm(i.naam));
					if (!s) return i;
					return {
						...i,
						score: {
							bereik: s.bereik,
							impact: s.impact,
							bewijskracht: s.bewijskracht,
							effort: s.effort,
							toelichting: s.toelichting
						}
					};
				});

				const { error: dbFout } = await supabase
					.from('trigger_map_versions')
					.update({ invalshoeken: bijgewerkt } as never)
					.eq('id', versieId);
				if (dbFout) error(500, dbFout.message);
				return json({ invalshoeken: bijgewerkt });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'scorekaart',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Scores voorstellen mislukt: ' + msg);
			}
			break;
		}

		case 'personas': {
			const versieId = String(body.versieId ?? '');
			if (!versieId) error(400, 'Ontbrekend id');
			const raw = Array.isArray(body.personas) ? body.personas : [];
			const schoon = raw.map((x: Record<string, unknown>) => ({
				naam: String(x?.naam ?? ''),
				omschrijving: String(x?.omschrijving ?? ''),
				kernbehoefte: String(x?.kernbehoefte ?? ''),
				kernbezwaar: String(x?.kernbezwaar ?? '')
			}));
			const { error: dbFout } = await supabase
				.from('trigger_map_versions')
				.update({ personas: schoon } as never)
				.eq('id', versieId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'activeer': {
			const clientId = String(body.clientId ?? '');
			const versieId = String(body.versieId ?? '');
			if (!clientId || !versieId) error(400, 'Ongeldig verzoek');
			await supabase
				.from('trigger_map_versions')
				.update({ is_actief: false })
				.eq('client_id', clientId)
				.eq('is_actief', true);
			const { error: dbFout } = await supabase
				.from('trigger_map_versions')
				.update({ is_actief: true })
				.eq('id', versieId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
