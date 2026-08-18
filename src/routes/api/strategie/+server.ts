import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Json } from '$lib/supabase/database.types';
import { genereerStrategiePlan, type StrategieConfig } from '$lib/server/strategie-ai';
import { afgeleidePrioriteit, type InvalshoekScore } from '$lib/trigger-map';
import { CLAUDE_MODEL } from '$lib/server/claude';
import type { StrategiePlan } from '$lib/testplan';

// AI-generatie met adaptive thinking; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

const strArr = (v: unknown) =>
	Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : undefined;

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		case 'plan': {
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			const feedback = body.feedback == null ? '' : String(body.feedback);
			const rawCfg = (body.config ?? {}) as Record<string, unknown>;
			const cfg: StrategieConfig = {
				personas: strArr(rawCfg.personas),
				funnelfases: strArr(rawCfg.funnelfases),
				middelen: strArr(rawCfg.middelen),
				doelstelling: rawCfg.doelstelling ? String(rawCfg.doelstelling) : undefined,
				target: rawCfg.target ? String(rawCfg.target) : undefined,
				maxVarianten: Number.isFinite(Number(rawCfg.maxVarianten))
					? Number(rawCfg.maxVarianten)
					: undefined,
				parallel: !!rawCfg.parallel
			};

			const { data: tm } = await supabase
				.from('trigger_map_versions')
				.select('pijnpunten, wensen, bezwaren, kansen_vs_concurrenten, personas, invalshoeken')
				.eq('client_id', clientId)
				.eq('is_actief', true)
				.maybeSingle();
			if (!tm) error(400, 'Genereer eerst een trigger map — die vormt de basis voor het plan.');

			type Inv = {
				naam?: string;
				omschrijving?: string;
				onderbouwing?: string;
				funnelfase?: string;
				status?: string;
				gearchiveerd?: boolean;
				score?: InvalshoekScore;
			};
			const invalshoeken = (tm.invalshoeken as Inv[] | null) ?? [];
			const werkt = invalshoeken
				.filter((i) => i.status === 'Getest — werkt')
				.map((i) => i.naam ?? '')
				.filter(Boolean);
			const werktNiet = invalshoeken
				.filter((i) => i.status === 'Getest — werkt niet')
				.map((i) => i.naam ?? '')
				.filter(Boolean);

			try {
				const res = await genereerStrategiePlan(
					{
						pijnpunten: (tm.pijnpunten as string[]) ?? [],
						wensen: (tm.wensen as string[]) ?? [],
						bezwaren: (tm.bezwaren as string[]) ?? [],
						kansen_vs_concurrenten: (tm.kansen_vs_concurrenten as string[]) ?? [],
						personas:
							(tm.personas as Array<{
								naam?: string;
								omschrijving?: string;
								kernbehoefte?: string;
								kernbezwaar?: string;
							}>) ?? [],
						invalshoeken: invalshoeken.map((i) => ({
							naam: i.naam,
							omschrijving: i.omschrijving,
							onderbouwing: i.onderbouwing,
							funnelfase: i.funnelfase,
							status: i.status,
							gearchiveerd: i.gearchiveerd,
							prioriteit: i.score ? afgeleidePrioriteit(i.score) : undefined
						})),
						werkt,
						werktNiet
					},
					cfg,
					feedback
				);

				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'strategie',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				return json({ plan: res.data });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await supabase.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'strategie',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Plan van aanpak opstellen mislukt: ' + msg);
			}
			break;
		}

		case 'goedkeuren': {
			// Goedgekeurd plan → wordt het testplan (matrix + testplan blijven zo consistent).
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			const plan = body.plan as StrategiePlan | null;
			if (!plan || !Array.isArray(plan.sprints)) error(400, 'Ongeldig plan');
			const testplan = { toelichting: plan.samenvatting ?? '', sprints: plan.sprints };
			const { error: dbFout } = await supabase
				.from('clients')
				.update({ testplan: testplan as unknown as Json })
				.eq('id', clientId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
