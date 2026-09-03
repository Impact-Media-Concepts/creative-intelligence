import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		// Loop-geheugen van een klant opslaan (RLS beschermt: alleen eigen klanten).
		case 'geheugen': {
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			const tekst = body.tekst == null ? null : String(body.tekst);
			const { error: dbFout } = await supabase
				.from('clients')
				.update({ loop_geheugen: tekst })
				.eq('id', clientId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		default:
			error(400, 'Onbekend type');
	}
};
