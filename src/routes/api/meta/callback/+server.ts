import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { exchangeCode, exchangeLongLived, fetchAdAccounts } from '$lib/server/meta/client';
import type { RequestHandler } from './$types';

/**
 * Meta OAuth-callback: wisselt de code voor een long-lived token, kiest een
 * standaard advertentieaccount en slaat de koppeling op. Daarna terug naar de
 * Sprint-pagina, waar de gebruiker eventueel een ander account kan kiezen.
 */
export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const fbError = url.searchParams.get('error_description') || url.searchParams.get('error');
	if (fbError) throw error(400, `Meta gaf een fout: ${fbError}`);
	if (!code || !state) throw error(400, 'Ontbrekende code/state');

	const [clientId, nonce] = state.split('.');
	const cookieNonce = cookies.get('meta_oauth_nonce');
	cookies.delete('meta_oauth_nonce', { path: '/' });
	if (!clientId || !nonce || nonce !== cookieNonce) throw error(400, 'Ongeldige state (CSRF)');

	// Toegang tot deze klant afdwingen via RLS.
	const { data: client } = await locals.supabase
		.from('clients')
		.select('id')
		.eq('id', clientId)
		.maybeSingle();
	if (!client) throw error(403, 'Geen toegang tot deze klant');

	const appId = env.META_APP_ID;
	const appSecret = env.META_APP_SECRET;
	if (!appId || !appSecret) throw error(500, 'META_APP_ID/META_APP_SECRET niet geconfigureerd');
	const redirectUri = env.META_REDIRECT_URI || `${url.origin}/api/meta/callback`;

	// Token-exchange: code → short-lived → long-lived.
	const kort = await exchangeCode(appId, appSecret, redirectUri, code);
	const lang = await exchangeLongLived(appId, appSecret, kort.access_token);

	// Beschikbare advertentieaccounts; standaard het eerste (te wijzigen in de UI).
	const accounts = await fetchAdAccounts(lang.access_token);
	if (!accounts.length) throw error(400, 'Geen toegankelijke advertentieaccounts gevonden');
	const doel = accounts[0];

	const verlooptAt = lang.expires_in
		? new Date(Date.now() + lang.expires_in * 1000).toISOString()
		: null;

	// Opslaan met de service-role (token buiten RLS houden). Upsert per klant.
	await supabaseAdmin.from('meta_connections').upsert(
		{
			client_id: clientId,
			ad_account_id: doel.id,
			ad_account_naam: doel.name,
			currency: doel.currency,
			timezone_name: doel.timezone_name,
			business_id: doel.business?.id ?? null,
			access_token: lang.access_token,
			token_verloopt_at: verlooptAt,
			gekoppeld_door: locals.user.id,
			gekoppeld_at: new Date().toISOString(),
			losgekoppeld_at: null,
			laatste_sync_status: null,
			laatste_sync_fout: null
		},
		{ onConflict: 'client_id' }
	);

	throw redirect(303, `/klanten/${clientId}/sprint?meta=verbonden`);
};
