/**
 * Guardrail — beslist of een variant automatisch als winnaar gemarkeerd mag worden.
 *
 * Principe: liever een keer niets doen dan een verkeerde winnaar aanwijzen.
 *   - Vergelijk binnen een testgroep (zelfde funnelfase + geteste variabele).
 *   - Primaire metric: ROAS (indien er aankopen zijn), anders CTR.
 *   - Alleen markeren bij voldoende spend/impressies/looptijd/conversies (drempels)
 *     én een duidelijke voorsprong op de beste alternatieve variant.
 *   - Nooit markeren als er in de groep al een (handmatige) winnaar is.
 * De vervolgronde blijft altijd 1 klik handmatig — die genereren we nooit vanzelf.
 */

import { GUARDRAIL, type MetaMetrics } from '$lib/meta';

export interface GuardrailConcept {
	id: string;
	funnelfase: string | null;
	variabele: string | null;
	is_winnaar: boolean;
	metrics: MetaMetrics | null;
	roas: number | null;
	ctr: number | null;
}

export interface AutoWinnaar {
	conceptId: string;
	reden: string;
}

function haaltDrempels(c: GuardrailConcept, primair: 'roas' | 'ctr'): boolean {
	const m = c.metrics;
	if (!m) return false;
	if (m.spend_cents < GUARDRAIL.minSpendCenten) return false;
	if (m.impressions < GUARDRAIL.minImpressies) return false;
	if (m.dagen_actief < GUARDRAIL.minDagenActief) return false;
	if (primair === 'roas' && m.purchases < GUARDRAIL.minConversies) return false;
	return true;
}

function pct(v: number): string {
	return `${Math.round(v * 100)}%`;
}

/**
 * Bepaalt per testgroep of er een automatische winnaar is.
 * Retourneert alleen concepten die NIEUW als winnaar gemarkeerd moeten worden.
 */
export function bepaalAutoWinnaars(concepten: GuardrailConcept[]): AutoWinnaar[] {
	const groepen = new Map<string, GuardrailConcept[]>();
	for (const c of concepten) {
		const sleutel = `${c.funnelfase ?? '?'}::${c.variabele ?? '?'}`;
		const lijst = groepen.get(sleutel) ?? [];
		lijst.push(c);
		groepen.set(sleutel, lijst);
	}

	const resultaat: AutoWinnaar[] = [];

	for (const [, groep] of groepen) {
		// Vergelijken vergt minstens 2 varianten met cijfers.
		const metCijfers = groep.filter((c) => c.metrics);
		if (metCijfers.length < 2) continue;
		// Al een winnaar in de groep? Menselijke/eerdere keuze respecteren.
		if (groep.some((c) => c.is_winnaar)) continue;

		// Primaire metric: ROAS als er ergens aankopen zijn, anders CTR.
		const heeftAankopen = metCijfers.some((c) => (c.metrics?.purchases ?? 0) > 0);
		const primair: 'roas' | 'ctr' = heeftAankopen ? 'roas' : 'ctr';
		const waardeVan = (c: GuardrailConcept) => (primair === 'roas' ? c.roas : c.ctr);

		// Kandidaat = hoogste primaire waarde die de harde drempels haalt.
		const kandidaten = metCijfers
			.filter((c) => waardeVan(c) != null && haaltDrempels(c, primair))
			.sort((a, b) => (waardeVan(b) ?? 0) - (waardeVan(a) ?? 0));
		if (!kandidaten.length) continue;

		const winnaar = kandidaten[0];
		const eigen = waardeVan(winnaar) ?? 0;

		// Beste alternatief (hoogste primaire waarde onder de overige varianten).
		const alternatieven = metCijfers
			.filter((c) => c.id !== winnaar.id)
			.map((c) => waardeVan(c))
			.filter((v): v is number => v != null);
		const besteAlt = alternatieven.length ? Math.max(...alternatieven) : 0;

		// Voorsprong: expliciet genoeg beter dan het beste alternatief.
		let voorsprongOk: boolean;
		let voorsprongTekst: string;
		if (besteAlt <= 0) {
			voorsprongOk = eigen > 0;
			voorsprongTekst = 'enige variant met resultaat';
		} else {
			const lift = (eigen - besteAlt) / besteAlt;
			voorsprongOk = lift >= GUARDRAIL.minVoorsprong;
			voorsprongTekst = `${pct(lift)} beter dan de op één na beste variant`;
		}
		if (!voorsprongOk) continue;

		const metricLabel = primair === 'roas' ? `ROAS ${eigen.toFixed(2)}×` : `CTR ${eigen.toFixed(2)}%`;
		resultaat.push({
			conceptId: winnaar.id,
			reden: `${metricLabel} — ${voorsprongTekst}. Automatisch gemarkeerd door de guardrail.`
		});
	}

	return resultaat;
}
