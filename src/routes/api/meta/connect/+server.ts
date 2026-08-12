import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { META_API_VERSION } from '$lib/server/meta/client';
import type { RequestHandler } from './$types';

/**
 * Start de Meta OAuth-flow voor één klant.
 *   GET /api/meta/connect?client=<clientId>
 * Zet een CSRF-nonce als cookie en stuurt door naar de Facebook-login.
 */
export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');

	const clientId = url.searchParams.get('client');
	if (!clientId) throw error(400, 'Ontbrekende client-parameter');

	// Toegang tot deze klant afdwingen via RLS (select geeft niets terug zonder toegang).
	const { data: client } = await locals.supabase
		.from('clients')
		.select('id')
		.eq('id', clientId)
		.maybeSingle();
	if (!client) throw error(403, 'Geen toegang tot deze klant');

	const appId = env.META_APP_ID;
	if (!appId) throw error(500, 'META_APP_ID is niet geconfigureerd');

	const redirectUri = env.META_REDIRECT_URI || `${url.origin}/api/meta/callback`;

	// CSRF-nonce: koppelt de callback aan deze browser.
	const nonce = crypto.randomUUID().replace(/-/g, '');
	cookies.set('meta_oauth_nonce', nonce, {
		path: '/',
		httpOnly: true,
		secure: url.protocol === 'https:',
		sameSite: 'lax',
		maxAge: 600
	});

	const state = `${clientId}.${nonce}`;
	const dialog = new URL(`https://www.facebook.com/${META_API_VERSION}/dialog/oauth`);
	dialog.searchParams.set('client_id', appId);
	dialog.searchParams.set('redirect_uri', redirectUri);
	dialog.searchParams.set('state', state);
	dialog.searchParams.set('scope', 'ads_read,business_management');
	dialog.searchParams.set('response_type', 'code');

	throw redirect(303, dialog.toString());
};
