/**
 * Meta Ad Library (officiële Graph API: /ads_archive) — publieke advertenties van concurrenten.
 *
 * Alleen het officiële endpoint, geen scraping van de website (dat is tegen de Meta-voorwaarden).
 * De API geeft GEEN formaat (video/static) en geen prestaties terug: wel tekst, startdatum,
 * of de ad nog loopt, platformen en een snapshot-link. "Lang lopend" is een goede aanwijzing
 * voor "winnend" (niemand laat een verliezende ad maandenlang draaien), maar geen bewijs.
 */

import { env } from '$env/dynamic/private';
import { META_API_VERSION } from './client';
import type { AdLibAd } from '$lib/ad-library-analyse';

// De rekenlogica staat client-safe in $lib/ad-library-analyse; hier opnieuw geëxporteerd.
export { filterOpPagina, samenvatAds } from '$lib/ad-library-analyse';
export type { AdLibAd, AdSamenvatting } from '$lib/ad-library-analyse';

const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const VELDEN = [
	'id',
	'page_id',
	'page_name',
	'ad_creation_time',
	'ad_delivery_start_time',
	'ad_delivery_stop_time',
	'ad_creative_bodies',
	'ad_creative_link_titles',
	'ad_creative_link_descriptions',
	'publisher_platforms',
	'ad_snapshot_url'
].join(',');

export class AdLibraryFout extends Error {
	constructor(
		message: string,
		/** true = een ander token proberen heeft zin. */
		public probeerAnder = false
	) {
		super(message);
		this.name = 'AdLibraryFout';
	}
}

/** Vertaalt een Graph-fout naar een begrijpelijke, actiegerichte melding. */
function vertaalFout(status: number, body: string): AdLibraryFout {
	let code = 0;
	let msg = '';
	try {
		const j = JSON.parse(body) as { error?: { code?: number; message?: string } };
		code = j.error?.code ?? 0;
		msg = j.error?.message ?? '';
	} catch {
		// geen JSON
	}
	if (code === 190)
		return new AdLibraryFout('Het Meta-token is verlopen of ongeldig. Koppel Meta opnieuw (Sprint → Meta-koppeling).', true);
	if (code === 10 || code === 200 || /permission|not authorized|verif/i.test(msg))
		return new AdLibraryFout(
			'Meta geeft deze app of dit account nog geen toegang tot de Ad Library API. Bevestig je identiteit op facebook.com/ID en accepteer de voorwaarden op facebook.com/ads/library/api — of vul dit veld handmatig in.',
			true
		);
	if (status === 429 || code === 4 || code === 17 || code === 613)
		return new AdLibraryFout('Meta ontvangt te veel verzoeken. Probeer het over enkele minuten opnieuw.');
	return new AdLibraryFout(`Meta Ad Library-fout (${status}${code ? `/${code}` : ''}): ${(msg || body).slice(0, 200)}`);
}

/** Haalt advertenties op met één specifiek token. */
async function haalMetToken(zoek: string, land: string, token: string, maxAds: number): Promise<AdLibAd[]> {
	const url = new URL(`${BASE}/ads_archive`);
	url.searchParams.set('access_token', token);
	url.searchParams.set('search_terms', zoek);
	url.searchParams.set('ad_reached_countries', JSON.stringify([land]));
	url.searchParams.set('ad_active_status', 'ALL');
	url.searchParams.set('ad_type', 'ALL');
	url.searchParams.set('fields', VELDEN);
	url.searchParams.set('limit', '50');

	const alles: AdLibAd[] = [];
	let volgende: string | null = url.toString();
	let pagina = 0;
	while (volgende && alles.length < maxAds && pagina++ < 6) {
		const res = await fetch(volgende);
		if (!res.ok) throw vertaalFout(res.status, await res.text().catch(() => ''));
		const j = (await res.json()) as { data?: AdLibAd[]; paging?: { next?: string } };
		alles.push(...(j.data ?? []));
		volgende = j.paging?.next ?? null;
	}
	return alles.slice(0, maxAds);
}

/**
 * Zoekt advertenties; probeert de opgegeven tokens in volgorde (bv. het klant-token en daarna
 * het app-token). Geeft aan welke toegang werkte.
 */
export async function zoekAdLibrary(opties: {
	zoek: string;
	land?: string;
	tokens: Array<{ soort: 'klant' | 'app'; token: string }>;
	maxAds?: number;
}): Promise<{ ads: AdLibAd[]; toegang: 'klant' | 'app' }> {
	if (opties.tokens.length === 0)
		throw new AdLibraryFout(
			'Geen toegang beschikbaar: koppel Meta voor deze klant (Sprint → Meta-koppeling) of stel META_APP_ID en META_APP_SECRET in.'
		);
	let laatste: AdLibraryFout | null = null;
	for (const t of opties.tokens) {
		try {
			const ads = await haalMetToken(opties.zoek, opties.land ?? 'NL', t.token, opties.maxAds ?? 150);
			return { ads, toegang: t.soort };
		} catch (e) {
			if (e instanceof AdLibraryFout) {
				laatste = e;
				if (e.probeerAnder) continue;
			}
			throw e;
		}
	}
	throw laatste ?? new AdLibraryFout('Ad Library zoeken mislukt.');
}

/** App-token (id|secret), alleen server-side beschikbaar. */
export function appToken(): string | null {
	return env.META_APP_ID && env.META_APP_SECRET ? `${env.META_APP_ID}|${env.META_APP_SECRET}` : null;
}
