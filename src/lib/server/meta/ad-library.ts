/**
 * Meta Ad Library (officiële Graph API: /ads_archive) — publieke advertenties van concurrenten.
 *
 * Alleen het officiële endpoint, geen scraping van de website (dat is tegen de Meta-voorwaarden).
 * De velden bevatten GEEN formaat en geen prestaties: wel tekst, startdatum, of de ad nog loopt,
 * platformen, een snapshot-link en (EU) een geschat bereik. Het formaat leiden we af via de
 * media_type-zoekfilter (VIDEO/IMAGE). "Lang lopend" is een goede aanwijzing
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
	'ad_snapshot_url',
	'eu_total_reach'
].join(',');

const VELDEN_ID = 'id,page_name';

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
	let sub = 0;
	let msg = '';
	try {
		const j = JSON.parse(body) as { error?: { code?: number; error_subcode?: number; message?: string } };
		code = j.error?.code ?? 0;
		sub = j.error?.error_subcode ?? 0;
		msg = j.error?.message ?? '';
	} catch {
		// geen JSON
	}
	if (code === 190)
		return new AdLibraryFout('Het Meta-token is verlopen of ongeldig. Koppel Meta opnieuw (Sprint → Meta-koppeling).', true);
	if (code === 10 || code === 200 || /permission|not authorized|verif/i.test(msg))
		return new AdLibraryFout(
			`Meta geeft deze toegang nog niet vrij voor de Ad Library API (alleen een persoon met bevestigde identiteit kan die gebruiken, niet het app-token). Stel een admin-token in bij Instellingen → Meta Ad Library, of vul dit veld handmatig in. (Meta: ${code}${sub ? `/${sub}` : ''} — ${msg.slice(0, 220)})`,
			true
		);
	if (status === 429 || code === 4 || code === 17 || code === 613)
		return new AdLibraryFout('Meta ontvangt te veel verzoeken. Probeer het over enkele minuten opnieuw.');
	return new AdLibraryFout(`Meta Ad Library-fout (${status}${code ? `/${code}` : ''}): ${(msg || body).slice(0, 200)}`);
}

/** Haalt advertenties op met één specifiek token. */
async function haalMetToken(
	zoek: string,
	land: string,
	token: string,
	maxAds: number,
	opties: { mediaType?: 'VIDEO' | 'IMAGE'; velden?: string } = {}
): Promise<AdLibAd[]> {
	const url = new URL(`${BASE}/ads_archive`);
	url.searchParams.set('access_token', token);
	url.searchParams.set('search_terms', zoek);
	url.searchParams.set('ad_reached_countries', JSON.stringify([land]));
	url.searchParams.set('ad_active_status', 'ALL');
	url.searchParams.set('ad_type', 'ALL');
	url.searchParams.set('fields', opties.velden ?? VELDEN);
	if (opties.mediaType) url.searchParams.set('media_type', opties.mediaType);
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
 * Bepaalt het formaat per ad via de media_type-filter van de API (twee extra, lichte zoekopdrachten).
 * Mislukt dat, dan blijft het formaat leeg ("onbekend"): de scan zelf valt daar nooit over.
 */
async function zetFormaten(ads: AdLibAd[], zoek: string, land: string, token: string, max: number) {
	try {
		const [video, beeld] = await Promise.all([
			haalMetToken(zoek, land, token, max, { mediaType: 'VIDEO', velden: VELDEN_ID }),
			haalMetToken(zoek, land, token, max, { mediaType: 'IMAGE', velden: VELDEN_ID })
		]);
		const videoIds = new Set(video.map((a) => a.id));
		const beeldIds = new Set(beeld.map((a) => a.id));
		for (const a of ads) {
			if (videoIds.has(a.id) && !beeldIds.has(a.id)) a.formaat = 'video';
			else if (beeldIds.has(a.id) && !videoIds.has(a.id)) a.formaat = 'afbeelding';
		}
	} catch {
		// formaat is een extra; de rest van de scan werkt ook zonder
	}
}

/**
 * Zoekt advertenties; probeert de opgegeven tokens in volgorde (bv. het klant-token en daarna
 * het app-token). Geeft aan welke toegang werkte.
 */
export async function zoekAdLibrary(opties: {
	zoek: string;
	land?: string;
	tokens: Array<{ soort: 'bureau' | 'klant' | 'app'; token: string }>;
	maxAds?: number;
}): Promise<{ ads: AdLibAd[]; toegang: 'bureau' | 'klant' | 'app' }> {
	if (opties.tokens.length === 0)
		throw new AdLibraryFout(
			'Geen toegang beschikbaar: stel een Ad Library-token in bij Instellingen → Meta Ad Library, of koppel Meta voor deze klant.'
		);
	let laatste: AdLibraryFout | null = null;
	for (const t of opties.tokens) {
		try {
			const land = opties.land ?? 'NL';
			const max = opties.maxAds ?? 150;
			const ads = await haalMetToken(opties.zoek, land, t.token, max);
			await zetFormaten(ads, opties.zoek, land, t.token, max);
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

/** Controleert met één lichte zoekopdracht of een token de Ad Library mag gebruiken. */
export async function testAdLibraryToken(token: string): Promise<{ ok: boolean; melding: string }> {
	try {
		await haalMetToken('nederland', 'NL', token, 1, { velden: 'id' });
		return { ok: true, melding: 'De Ad Library geeft antwoord met dit token.' };
	} catch (e) {
		return { ok: false, melding: e instanceof Error ? e.message : 'Onbekende fout' };
	}
}
