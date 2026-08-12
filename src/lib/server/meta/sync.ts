/**
 * Sync-orkestratie voor één Meta-koppeling (één klant).
 *
 * Stappen:
 *   1. Advertenties + dagelijkse insights ophalen (venster: laatste 14 dagen).
 *   2. Aggregeren per advertentie en de catalogus (meta_ads) bijwerken.
 *   3. Automatisch koppelen: concept ⇢ advertentie via de [CL-xxxxxxxx]-code in de ad-naam.
 *   4. Metrics per gekoppeld concept wegschrijven (alleen als meta_auto_sync aan staat).
 *   5. Guardrail draaien: hoog-vertrouwen winnaars automatisch markeren + invalshoek op "werkt".
 *
 * Idempotent en niet-destructief: draait de sync opnieuw, dan komt hetzelfde eruit.
 * Wist nooit handmatig ingevoerde data; overschrijft alleen metrics van auto-sync-concepten.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, MetaConnection } from '$lib/supabase/database.types';
import type { Json } from '$lib/supabase/database.types';
import { adNaamMatchtConcept, type MetaMetrics } from '$lib/meta';
import { fetchAccount, fetchAds, fetchAdInsightsDaily, type MetaInsight } from './client';
import { aggregeerInsights, afgeleideMetrics } from './metrics';
import { bepaalAutoWinnaars, type GuardrailConcept } from './guardrail';

type Admin = SupabaseClient<Database>;

export interface SyncResultaat {
	ok: boolean;
	fout?: string;
	stats: {
		advertenties: number;
		gekoppeld: number;
		metrics_bijgewerkt: number;
		auto_winnaars: number;
	};
}

function isoDatum(d: Date): string {
	return d.toISOString().slice(0, 10);
}

/** Standaardvenster: laatste 14 dagen tot vandaag. */
function venster(nu: Date): { van: string; tot: string } {
	const van = new Date(nu);
	van.setUTCDate(nu.getUTCDate() - 14);
	return { van: isoDatum(van), tot: isoDatum(nu) };
}

/** Markeert de invalshoek van een winnaar in de actieve trigger map als "Getest — werkt". */
async function markeerInvalshoekGetest(admin: Admin, clientId: string, invalshoek: string | null) {
	if (!invalshoek) return;
	const norm = (v: unknown) =>
		String(v ?? '')
			.replace(/^\s*\[[^\]]*\]\s*/, '')
			.trim()
			.toLowerCase();
	const doel = norm(invalshoek);
	const { data: tm } = await admin
		.from('trigger_map_versions')
		.select('id, invalshoeken')
		.eq('client_id', clientId)
		.eq('is_actief', true)
		.maybeSingle();
	if (!tm) return;
	const lijst = (tm.invalshoeken as Array<Record<string, unknown>> | null) ?? [];
	let gewijzigd = false;
	const nieuw = lijst.map((i) => {
		if (norm(i.naam) === doel && i.status !== 'Getest — werkt') {
			gewijzigd = true;
			return { ...i, status: 'Getest — werkt' };
		}
		return i;
	});
	if (gewijzigd) {
		await admin
			.from('trigger_map_versions')
			.update({ invalshoeken: nieuw as unknown as Json })
			.eq('id', tm.id);
	}
}

export async function syncConnection(admin: Admin, conn: MetaConnection): Promise<SyncResultaat> {
	const stats = { advertenties: 0, gekoppeld: 0, metrics_bijgewerkt: 0, auto_winnaars: 0 };
	const nu = new Date();

	if (conn.losgekoppeld_at) return { ok: true, stats };
	if (!conn.access_token) {
		await schrijfStatus(admin, conn.id, 'error', 'Geen token — herkoppelen nodig');
		return { ok: false, fout: 'Geen token', stats };
	}

	try {
		// Accountgegevens verversen (valuta/naam) — faalt zacht.
		try {
			const acct = await fetchAccount(conn.ad_account_id, conn.access_token);
			await admin
				.from('meta_connections')
				.update({
					ad_account_naam: acct.name,
					currency: acct.currency,
					timezone_name: acct.timezone_name,
					business_id: acct.business?.id ?? null
				})
				.eq('id', conn.id);
		} catch {
			// niet kritiek
		}

		const win = venster(nu);
		const [ads, insights] = await Promise.all([
			fetchAds(conn.ad_account_id, conn.access_token),
			fetchAdInsightsDaily(conn.ad_account_id, conn.access_token, win.van, win.tot)
		]);
		stats.advertenties = ads.length;

		// Insights groeperen per ad_id.
		const perAd = new Map<string, MetaInsight[]>();
		for (const i of insights) {
			if (!i.ad_id) continue;
			const lijst = perAd.get(i.ad_id) ?? [];
			lijst.push(i);
			perAd.set(i.ad_id, lijst);
		}

		// Catalogus (meta_ads) upserten + ruwe metrics per ad bewaren.
		const metricsPerAd = new Map<string, MetaMetrics>();
		const bijgewerkt = nu.toISOString();
		const adRijen = ads.map((a) => {
			const m = aggregeerInsights(
				perAd.get(a.id) ?? [],
				{ van: win.van, tot: win.tot },
				a.created_time ?? null,
				bijgewerkt
			);
			metricsPerAd.set(a.id, m);
			return {
				connection_id: conn.id,
				client_id: conn.client_id,
				external_id: a.id,
				naam: a.name ?? null,
				adset_id: a.adset_id ?? null,
				campaign_id: a.campaign_id ?? null,
				status: a.effective_status ?? null,
				preview_url: a.preview_shareable_link ?? null,
				eerste_gezien_at: a.created_time ?? null,
				laatste_metrics: m as unknown as Json,
				laatste_sync_at: bijgewerkt
			};
		});
		if (adRijen.length) {
			await admin
				.from('meta_ads')
				.upsert(adRijen, { onConflict: 'connection_id,external_id' });
		}

		// Concepten van deze klant laden (niet gearchiveerd).
		const { data: concepten } = await admin
			.from('concepts')
			.select(
				'id, invalshoek, funnelfase, variabele, is_winnaar, meta_ad_external_id, meta_auto_sync'
			)
			.eq('client_id', conn.client_id)
			.eq('gearchiveerd', false);

		const lijst = concepten ?? [];

		// 3. Auto-koppelen op de [CL-xxxxxxxx]-code (alleen als nog niet gekoppeld).
		for (const c of lijst) {
			if (c.meta_ad_external_id) continue;
			const match = ads.find((a) => adNaamMatchtConcept(a.name, c.id));
			if (match) {
				await admin
					.from('concepts')
					.update({ meta_ad_external_id: match.id })
					.eq('id', c.id);
				c.meta_ad_external_id = match.id;
				stats.gekoppeld++;
			}
		}

		// 4. Metrics per gekoppeld concept wegschrijven (auto-sync aan).
		const guardrailInput: GuardrailConcept[] = [];
		for (const c of lijst) {
			if (!c.meta_ad_external_id) continue;
			const m = metricsPerAd.get(c.meta_ad_external_id);
			if (!m) continue;
			const afgeleid = afgeleideMetrics(m);
			if (c.meta_auto_sync) {
				await admin
					.from('concepts')
					.update({
						hook_rate: afgeleid.hook_rate,
						hold_rate: afgeleid.hold_rate,
						ctr: afgeleid.ctr,
						roas: afgeleid.roas,
						cpa: afgeleid.cpa,
						meta_metrics: m as unknown as Json,
						meta_laatste_sync: bijgewerkt
					})
					.eq('id', c.id);
				stats.metrics_bijgewerkt++;
			}
			guardrailInput.push({
				id: c.id,
				funnelfase: c.funnelfase,
				variabele: c.variabele,
				is_winnaar: c.is_winnaar,
				metrics: c.meta_auto_sync ? m : null,
				roas: afgeleid.roas,
				ctr: afgeleid.ctr
			});
		}

		// 5. Guardrail: automatische winnaars markeren.
		const autoWinnaars = bepaalAutoWinnaars(guardrailInput);
		for (const w of autoWinnaars) {
			const { data: bijgewerktConcept } = await admin
				.from('concepts')
				.update({ is_winnaar: true, auto_winnaar: true })
				.eq('id', w.conceptId)
				.eq('is_winnaar', false) // race-veilig: alleen als nog geen winnaar
				.select('invalshoek')
				.maybeSingle();
			if (bijgewerktConcept) {
				await markeerInvalshoekGetest(admin, conn.client_id, bijgewerktConcept.invalshoek);
				stats.auto_winnaars++;
			}
		}

		await schrijfStatus(admin, conn.id, 'success', null);
		return { ok: true, stats };
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await schrijfStatus(admin, conn.id, 'error', msg);
		return { ok: false, fout: msg, stats };
	}
}

async function schrijfStatus(
	admin: Admin,
	connId: string,
	status: 'success' | 'error',
	fout: string | null
) {
	await admin
		.from('meta_connections')
		.update({
			laatste_sync_at: new Date().toISOString(),
			laatste_sync_status: status,
			laatste_sync_fout: fout
		})
		.eq('id', connId);
}
