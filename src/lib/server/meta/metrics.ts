/**
 * Vertaalt ruwe Meta-insights naar de Creative Loop metrics.
 * Units sluiten aan op de bestaande Sprint-invoer (zie src/lib/sprint.ts):
 *   hook_rate, hold_rate, ctr = percentage (30 = 30%)
 *   roas = ratio (2.5 = 2,5×)
 *   cpa  = euro's per aankoop
 */

import type { MetaInsight } from './client';
import type { MetaMetrics } from '$lib/meta';

const PURCHASE_TYPES = [
	'purchase',
	'omni_purchase',
	'offsite_conversion.fb_pixel_purchase'
];

function som(rijen: Array<{ action_type: string; value: string }> | undefined, types: string[]): number {
	if (!rijen) return 0;
	return rijen
		.filter((r) => types.includes(r.action_type))
		.reduce((acc, r) => acc + Number(r.value || 0), 0);
}

function getal(v: string | undefined): number {
	const n = Number(v ?? 0);
	return Number.isFinite(n) ? n : 0;
}

/** Aggregeert alle dagelijkse insight-rijen van één advertentie tot ruwe totalen. */
export function aggregeerInsights(
	rijen: MetaInsight[],
	venster: { van: string; tot: string },
	eersteGezienAt: string | null,
	bijgewerktAt: string
): MetaMetrics {
	let impressions = 0;
	let spendEuro = 0;
	let clicks = 0;
	let linkClicks = 0;
	let purchases = 0;
	let purchaseValueEuro = 0;
	let video3s = 0;
	let thruplays = 0;
	const dagen = new Set<string>();

	for (const i of rijen) {
		const imp = getal(i.impressions);
		impressions += imp;
		spendEuro += getal(i.spend);
		clicks += getal(i.clicks);
		linkClicks += getal(i.inline_link_clicks);
		purchases += som(i.actions, PURCHASE_TYPES);
		purchaseValueEuro += som(i.action_values, PURCHASE_TYPES);
		video3s += getal(i.video_3_sec_watched_actions?.[0]?.value);
		thruplays += getal(i.video_thruplay_watched_actions?.[0]?.value);
		if (imp > 0) dagen.add(i.date_start);
	}

	return {
		impressions,
		spend_cents: Math.round(spendEuro * 100),
		clicks,
		link_clicks: linkClicks,
		purchases,
		purchase_value_cents: Math.round(purchaseValueEuro * 100),
		video_3s: video3s,
		thruplays,
		dagen_actief: dagen.size,
		eerste_gezien_at: eersteGezienAt,
		venster_van: venster.van,
		venster_tot: venster.tot,
		bijgewerkt_at: bijgewerktAt
	};
}

/** Rondt af op 2 decimalen (of null bij geen data). */
function rond(v: number): number {
	return Math.round(v * 100) / 100;
}

export interface AfgeleideMetrics {
	hook_rate: number | null;
	hold_rate: number | null;
	ctr: number | null;
	roas: number | null;
	cpa: number | null;
}

/** Berekent de 5 Sprint-metrics uit de ruwe totalen. */
export function afgeleideMetrics(m: MetaMetrics): AfgeleideMetrics {
	const hook_rate = m.impressions > 0 ? rond((m.video_3s / m.impressions) * 100) : null;
	// Hold rate = thruplay-views t.o.v. 3-seconden-views (kijkbehoud van de video).
	const hold_rate = m.video_3s > 0 ? rond((m.thruplays / m.video_3s) * 100) : null;
	const ctr = m.impressions > 0 ? rond((m.link_clicks / m.impressions) * 100) : null;
	const roas = m.spend_cents > 0 ? rond(m.purchase_value_cents / m.spend_cents) : null;
	const cpa = m.purchases > 0 ? rond(m.spend_cents / 100 / m.purchases) : null;
	return { hook_rate, hold_rate, ctr, roas, cpa };
}
