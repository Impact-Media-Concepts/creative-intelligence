/**
 * Lichtgewicht client voor de Meta Marketing API (Graph API).
 * - Paging via cursor (paging.next)
 * - Retry op 429 / 5xx met exponential backoff
 * - Caller geeft altijd het access_token mee (tokens worden hier niet gelezen)
 *
 * Overgenomen en afgeslankt uit een eerdere interne app.
 */

import { env } from '$env/dynamic/private';

export const META_API_VERSION = env.META_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message);
		this.name = 'MetaError';
	}
}

export interface MetaAccountSummary {
	id: string; // act_xxx
	name: string;
	currency: string;
	timezone_name: string;
	business?: { id: string; name: string };
}

export interface MetaAdRaw {
	id: string;
	name: string;
	adset_id: string;
	campaign_id: string;
	effective_status?: string;
	creative?: { id: string };
	preview_shareable_link?: string;
	created_time?: string;
}

export interface MetaInsight {
	date_start: string;
	date_stop: string;
	ad_id?: string;
	impressions?: string;
	reach?: string;
	clicks?: string;
	inline_link_clicks?: string;
	spend?: string;
	frequency?: string;
	video_3_sec_watched_actions?: Array<{ value: string }>;
	video_thruplay_watched_actions?: Array<{ value: string }>;
	actions?: Array<{ action_type: string; value: string }>;
	action_values?: Array<{ action_type: string; value: string }>;
}

async function wacht(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/** Losse GET met retry. */
async function metaFetch<T>(
	path: string,
	accessToken: string,
	params: Record<string, string | number | undefined> = {},
	retries = 3
): Promise<T> {
	const url = new URL(`${BASE}${path}`);
	url.searchParams.set('access_token', accessToken);
	for (const [k, v] of Object.entries(params)) {
		if (v != null) url.searchParams.set(k, String(v));
	}

	let laatste: unknown;
	for (let poging = 0; poging <= retries; poging++) {
		try {
			const res = await fetch(url.toString());
			if (res.ok) return (await res.json()) as T;
			const status = res.status;
			const body = await res.text();
			if ((status === 429 || status >= 500) && poging < retries) {
				await wacht(Math.min(2 ** poging * 1000 + Math.random() * 500, 15_000));
				continue;
			}
			throw new MetaError(`Meta ${status}: ${body.slice(0, 400)}`, status);
		} catch (e) {
			laatste = e;
			if (e instanceof MetaError && e.status < 500 && e.status !== 429) throw e;
			if (poging === retries) throw e;
			await wacht(2 ** poging * 500);
		}
	}
	throw laatste ?? new Error('Meta fetch mislukt');
}

/** GET met automatische paginatie over paging.next. */
async function paginate<T>(
	path: string,
	accessToken: string,
	params: Record<string, string | number | undefined> = {}
): Promise<T[]> {
	const alles: T[] = [];
	const u = new URL(`${BASE}${path}`);
	u.searchParams.set('access_token', accessToken);
	for (const [k, v] of Object.entries(params)) {
		if (v != null) u.searchParams.set(k, String(v));
	}
	let volgende: string | null = u.toString();

	let veiligheid = 0;
	while (volgende && veiligheid++ < 50) {
		const res = await fetch(volgende);
		if (!res.ok) {
			const body = await res.text();
			throw new MetaError(`Meta ${res.status}: ${body.slice(0, 400)}`, res.status);
		}
		const jsonData = (await res.json()) as { data: T[]; paging?: { next?: string } };
		alles.push(...(jsonData.data ?? []));
		volgende = jsonData.paging?.next ?? null;
	}
	return alles;
}

// --- OAuth token-exchange -------------------------------------------------

/** Wisselt een OAuth-code voor een short-lived token. */
export async function exchangeCode(
	appId: string,
	appSecret: string,
	redirectUri: string,
	code: string
): Promise<{ access_token: string }> {
	const url = new URL(`${BASE}/oauth/access_token`);
	url.searchParams.set('client_id', appId);
	url.searchParams.set('client_secret', appSecret);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('code', code);
	const res = await fetch(url.toString());
	if (!res.ok) throw new MetaError(`Token-exchange: ${await res.text()}`, res.status);
	return (await res.json()) as { access_token: string };
}

/** Wisselt een short-lived token voor een long-lived token (~60 dagen). */
export async function exchangeLongLived(
	appId: string,
	appSecret: string,
	shortToken: string
): Promise<{ access_token: string; expires_in?: number }> {
	const url = new URL(`${BASE}/oauth/access_token`);
	url.searchParams.set('grant_type', 'fb_exchange_token');
	url.searchParams.set('client_id', appId);
	url.searchParams.set('client_secret', appSecret);
	url.searchParams.set('fb_exchange_token', shortToken);
	const res = await fetch(url.toString());
	if (!res.ok) throw new MetaError(`Long-lived token: ${await res.text()}`, res.status);
	return (await res.json()) as { access_token: string; expires_in?: number };
}

// --- Data -----------------------------------------------------------------

/** Alle advertentieaccounts waartoe de gebruiker toegang heeft. */
export async function fetchAdAccounts(accessToken: string): Promise<MetaAccountSummary[]> {
	return paginate<MetaAccountSummary>('/me/adaccounts', accessToken, {
		fields: 'id,name,currency,timezone_name,business{id,name}',
		limit: 200
	});
}

export async function fetchAccount(adAccountId: string, accessToken: string) {
	return metaFetch<MetaAccountSummary>(`/${adAccountId}`, accessToken, {
		fields: 'id,name,currency,timezone_name,business{id,name}'
	});
}

export async function fetchAds(adAccountId: string, accessToken: string) {
	return paginate<MetaAdRaw>(`/${adAccountId}/ads`, accessToken, {
		fields:
			'id,name,adset_id,campaign_id,effective_status,creative{id},preview_shareable_link,created_time',
		limit: 200
	});
}

/** Dagelijkse ad-level insights over [since, until] (YYYY-MM-DD). */
export async function fetchAdInsightsDaily(
	adAccountId: string,
	accessToken: string,
	since: string,
	until: string
) {
	return paginate<MetaInsight>(`/${adAccountId}/insights`, accessToken, {
		level: 'ad',
		time_increment: 1,
		time_range: JSON.stringify({ since, until }),
		fields: [
			'ad_id',
			'impressions',
			'reach',
			'clicks',
			'inline_link_clicks',
			'spend',
			'frequency',
			'video_3_sec_watched_actions',
			'video_thruplay_watched_actions',
			'actions',
			'action_values'
		].join(','),
		limit: 500
	});
}
