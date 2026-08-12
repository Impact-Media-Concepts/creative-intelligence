import { createServerClient } from '@supabase/ssr';
import { type Handle, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '$lib/supabase/database.types';

/**
 * Routes die toegankelijk zijn zonder ingelogde sessie.
 * /api/cron wordt door Vercel Cron aangeroepen (geen cookie) en beschermt zichzelf
 * met CRON_SECRET; zonder deze uitzondering zou de auth-guard 'm naar /login sturen.
 */
const PUBLIEKE_PADEN = ['/login', '/auth', '/api/cron'];

function isPubliek(pathname: string): boolean {
	return PUBLIEKE_PADEN.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient<Database>(
		PUBLIC_SUPABASE_URL,
		PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	/**
	 * Veilige sessie-check: haalt eerst de sessie op uit cookies en valideert
	 * daarna de gebruiker bij Supabase (getUser) om spoofing te voorkomen.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) {
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	const publiek = isPubliek(event.url.pathname);

	// Niet-ingelogd en niet op een publieke route -> naar login
	if (!session && !publiek) {
		throw redirect(303, '/login');
	}

	// Wel ingelogd maar op de loginpagina -> naar overzicht
	if (session && event.url.pathname === '/login') {
		throw redirect(303, '/');
	}

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
