import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Json } from '$lib/supabase/database.types';
import { genereerTestplan } from '$lib/server/testplan-ai';
import { CLAUDE_MODEL } from '$lib/server/claude';

// AI-generatie met adaptive thinking duurt langer; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || body.type !== 'genereer') error(400, 'Ongeldig verzoek');

	const clientId = String(body.clientId ?? '');
	if (!clientId) error(400, 'Ontbrekende klant');
	const feedback = body.feedback == null ? '' : String(body.feedback);

	const [{ data: tm }, { data: concepten }] = await Promise.all([
		supabase
			.from('trigger_map_versions')
			.select('personas, pijnpunten, wensen')
			.eq('client_id', clientId)
			.eq('is_actief', true)
			.maybeSingle(),
		supabase
			.from('concepts')
			.select('funnelfase, invalshoek, format, structuur, variabele, prioriteit')
			.eq('client_id', clientId)
			.eq('gearchiveerd', false)
			.order('created_at', { ascending: true })
	]);

	if (!concepten || concepten.length === 0) {
		error(400, 'Maak eerst concepten aan in de matrix — die vormen de basis voor het testplan.');
	}

	try {
		const res = await genereerTestplan({
			personas:
				(tm?.personas as Array<{
					naam?: string;
					omschrijving?: string;
					kernbehoefte?: string;
					kernbezwaar?: string;
				}>) ?? [],
			concepten,
			pijnpunten: (tm?.pijnpunten as string[]) ?? [],
			wensen: (tm?.wensen as string[]) ?? [],
			feedback
		});

		await supabase.from('ai_logs').insert({
			client_id: clientId,
			gebruiker_id: user.id,
			module: 'testplan',
			model: res.model,
			prompt: res.prompt,
			response: res.response,
			tokens_input: res.tokensInput,
			tokens_output: res.tokensOutput,
			duur_ms: res.duurMs
		});

		await supabase
			.from('clients')
			.update({ testplan: res.data as unknown as Json })
			.eq('id', clientId);

		return json({ testplan: res.data });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'onbekende fout';
		await supabase.from('ai_logs').insert({
			client_id: clientId,
			gebruiker_id: user.id,
			module: 'testplan',
			model: CLAUDE_MODEL,
			response: 'FOUT: ' + msg
		});
		error(500, 'Testplan genereren mislukt: ' + msg);
	}
};
