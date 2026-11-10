/**
 * Het Meta-gebruikerstoken van het bureau voor de Ad Library.
 *
 * Meta geeft de Ad Library API alleen vrij aan een PERSOON met bevestigde identiteit (facebook.com/ID);
 * het app-token (id|secret) wordt geweigerd. Een admin plakt daarom één keer een token uit de Graph API
 * Explorer in Instellingen; de server wisselt dat in voor een langlopend token (±60 dagen) en bewaart het
 * in `bureau_instellingen` (alleen de server komt erbij; het token wordt nooit teruggestuurd naar de browser).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '../supabase-admin';
import { META_API_VERSION } from './client';

// De tabel staat niet in de gegenereerde types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as unknown as SupabaseClient<any, any, any>;
const SLEUTEL = 'meta_adlib_token';

export interface BureauTokenStatus {
	ingesteld: boolean;
	verlopen: boolean;
	verloopt_at: string | null;
	bijgewerkt_at: string | null;
}

export async function leesBureauTokenStatus(): Promise<BureauTokenStatus> {
	const { data, error } = await db.from('bureau_instellingen').select('waarde, verloopt_at, bijgewerkt_at').eq('sleutel', SLEUTEL).maybeSingle();
	if (error || !data?.waarde) return { ingesteld: false, verlopen: false, verloopt_at: null, bijgewerkt_at: null };
	const verlopen = !!data.verloopt_at && new Date(data.verloopt_at).getTime() <= Date.now();
	return { ingesteld: true, verlopen, verloopt_at: data.verloopt_at ?? null, bijgewerkt_at: data.bijgewerkt_at ?? null };
}

/** Het token zelf, of null als er geen (geldig) is. Alleen voor gebruik in server-code. */
export async function leesBureauToken(): Promise<string | null> {
	const { data, error } = await db.from('bureau_instellingen').select('waarde, verloopt_at').eq('sleutel', SLEUTEL).maybeSingle();
	if (error || !data?.waarde) return null;
	if (data.verloopt_at && new Date(data.verloopt_at).getTime() <= Date.now()) return null;
	return data.waarde as string;
}

/** Bewaart een token dat al langlopend is (bv. uit de Facebook-login). */
export async function bewaarLangToken(token: string, expiresIn: number | undefined, userId: string): Promise<{ verloopt_at: string }> {
	const seconden = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 60 * 86400;
	const verloopt_at = new Date(Date.now() + seconden * 1000).toISOString();
	const { error } = await db.from('bureau_instellingen').upsert({
		sleutel: SLEUTEL,
		waarde: token,
		verloopt_at,
		bijgewerkt_door: userId,
		bijgewerkt_at: new Date().toISOString()
	});
	if (error) {
		if (/bureau_instellingen/i.test(error.message)) throw new Error('Draai eerst migratie 0018 in Supabase.');
		throw new Error('Opslaan mislukt: ' + error.message);
	}
	return { verloopt_at };
}

/** Wisselt een (kortlopend) token in voor een langlopend token en bewaart het. Geeft de verloopdatum terug. */
export async function bewaarBureauToken(kortToken: string, userId: string): Promise<{ langToken: string; verloopt_at: string }> {
	const appId = env.META_APP_ID;
	const secret = env.META_APP_SECRET;
	if (!appId || !secret) throw new Error('META_APP_ID en META_APP_SECRET ontbreken op de server.');

	const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/oauth/access_token`);
	url.searchParams.set('grant_type', 'fb_exchange_token');
	url.searchParams.set('client_id', appId);
	url.searchParams.set('client_secret', secret);
	url.searchParams.set('fb_exchange_token', kortToken);
	const res = await fetch(url);
	const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: { message?: string } };
	if (!res.ok || !j.access_token) throw new Error('Meta weigerde het token: ' + (j.error?.message ?? `status ${res.status}`));

	const { verloopt_at } = await bewaarLangToken(j.access_token, j.expires_in, userId);
	return { langToken: j.access_token, verloopt_at };
}
