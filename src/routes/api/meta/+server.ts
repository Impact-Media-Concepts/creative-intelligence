import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { fetchAccount, fetchAdAccounts } from '$lib/server/meta/client';
import { syncConnection } from '$lib/server/meta/sync';

// Sync-nu haalt Meta-data op; ruimere Vercel-functietimeout.
export const config = { maxDuration: 60 };

/** Leest de koppeling van een klant via RLS (geeft null zonder toegang). */
async function laadConnectie(supabase: App.Locals['supabase'], clientId: string) {
	const { data } = await supabase
		.from('meta_connections')
		.select('*')
		.eq('client_id', clientId)
		.maybeSingle();
	return data;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	switch (body.type) {
		// Beschikbare advertentieaccounts ophalen (om te kiezen in de UI).
		case 'accounts': {
			const conn = await laadConnectie(supabase, String(body.client ?? ''));
			if (!conn || !conn.access_token) error(404, 'Geen koppeling');
			try {
				const accounts = await fetchAdAccounts(conn.access_token);
				return json({
					accounts: accounts.map((a) => ({
						id: a.id,
						naam: a.name,
						currency: a.currency,
						actief: a.id === conn.ad_account_id
					}))
				});
			} catch (e) {
				error(502, e instanceof Error ? e.message : 'Meta-fout');
			}
			break;
		}

		// Ander advertentieaccount kiezen binnen dezelfde koppeling.
		case 'set_account': {
			const conn = await laadConnectie(supabase, String(body.client ?? ''));
			if (!conn || !conn.access_token) error(404, 'Geen koppeling');
			const adAccountId = String(body.ad_account_id ?? '');
			if (!adAccountId) error(400, 'Ontbrekend ad_account_id');
			let naam: string | null = null;
			let currency: string | null = null;
			try {
				const acct = await fetchAccount(adAccountId, conn.access_token);
				naam = acct.name;
				currency = acct.currency;
			} catch {
				// naam/currency niet kritiek
			}
			await supabaseAdmin
				.from('meta_connections')
				.update({
					ad_account_id: adAccountId,
					ad_account_naam: naam,
					currency,
					laatste_sync_status: null,
					laatste_sync_fout: null
				})
				.eq('id', conn.id);
			return json({ ok: true });
		}

		// Direct synchroniseren (handmatige knop).
		case 'sync_now': {
			const conn = await laadConnectie(supabase, String(body.client ?? ''));
			if (!conn) error(404, 'Geen koppeling');
			const res = await syncConnection(supabaseAdmin, conn);
			if (!res.ok) error(502, res.fout ?? 'Sync mislukt');
			return json({ ok: true, stats: res.stats });
		}

		// Koppeling verbreken (token wissen, sync slaat over).
		case 'disconnect': {
			const conn = await laadConnectie(supabase, String(body.client ?? ''));
			if (!conn) error(404, 'Geen koppeling');
			await supabaseAdmin
				.from('meta_connections')
				.update({ losgekoppeld_at: new Date().toISOString(), access_token: null })
				.eq('id', conn.id);
			return json({ ok: true });
		}

		// Een concept aan een advertentie koppelen (of ontkoppelen met null).
		case 'link': {
			const conceptId = String(body.conceptId ?? '');
			if (!conceptId) error(400, 'Ontbrekend conceptId');
			const adExternalId = body.ad_external_id ? String(body.ad_external_id) : null;
			const { error: dbFout } = await supabase
				.from('concepts')
				.update({ meta_ad_external_id: adExternalId })
				.eq('id', conceptId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		// Auto-sync per concept aan/uit zetten.
		case 'toggle_auto_sync': {
			const conceptId = String(body.conceptId ?? '');
			if (!conceptId) error(400, 'Ontbrekend conceptId');
			const { error: dbFout } = await supabase
				.from('concepts')
				.update({ meta_auto_sync: !!body.waarde })
				.eq('id', conceptId);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
