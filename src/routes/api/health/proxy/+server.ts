import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Diagnose-endpoint (ingelogd) om te controleren of de proxy-env-vars aankomen
 * in de draaiende (Vercel-)omgeving. Lekt geen secrets — alleen aanwezig ja/nee,
 * de lengte, en welke commit er live draait.
 */
export const GET: RequestHandler = async ({ locals: { user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const key = env.API_USAGE_KEY ?? '';
	return json({
		commit: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'onbekend (lokaal?)',
		omgeving: env.VERCEL_ENV ?? 'lokaal',
		api_usage_key_aanwezig: key.length > 0,
		api_usage_key_lengte: key.length,
		api_usage_connection_id_aanwezig: !!env.API_USAGE_CONNECTION_ID,
		api_usage_url_gezet: !!env.API_USAGE_URL,
		api_usage_url: env.API_USAGE_URL ?? '(default in code)'
	});
};
