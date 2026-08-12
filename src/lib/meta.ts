/**
 * Client-safe Meta-helpers (geen server-imports).
 * Bevat de ad-naam-code voor automatisch koppelen + de drempels die de
 * guardrail gebruikt om een winnaar automatisch te durven markeren.
 */

/**
 * Korte code die een concept identificeert in een Meta-advertentienaam.
 * Zet deze code in de ad-naam (bv. "TOFU | Angst voor missers [CL-3f9a2b71]")
 * en de dagelijkse sync koppelt de advertentie automatisch aan het concept.
 */
export function conceptAdCode(conceptId: string): string {
	return `CL-${conceptId.replace(/-/g, '').slice(0, 8)}`;
}

/** Vindt alle concept-codes in een advertentienaam (hoofdletterongevoelig). */
export function parseConceptCodes(adNaam: string | null | undefined): string[] {
	if (!adNaam) return [];
	const matches = adNaam.match(/CL-[0-9a-f]{8}/gi) ?? [];
	return matches.map((m) => m.toUpperCase());
}

/** Matcht een advertentienaam tegen een concept-id (via de code). */
export function adNaamMatchtConcept(adNaam: string | null | undefined, conceptId: string): boolean {
	return parseConceptCodes(adNaam).includes(conceptAdCode(conceptId).toUpperCase());
}

/**
 * Drempels waaronder de guardrail GEEN automatische winnaar mag markeren.
 * Bewust conservatief: liever een keer niets doen dan een verkeerde winnaar.
 */
export const GUARDRAIL = {
	/** Minimale spend (in centen) voordat een variant "hard genoeg" is. €75. */
	minSpendCenten: 7500,
	/** Minimale impressies. */
	minImpressies: 1000,
	/** Minimaal aantal dagen actief in het venster. */
	minDagenActief: 3,
	/** Minimaal aantal conversies (aankopen) als ROAS/CPA de primaire metric is. */
	minConversies: 5,
	/** Minimale relatieve voorsprong op de beste alternatieve variant (15%). */
	minVoorsprong: 0.15
} as const;

/** Vorm van de geaggregeerde ruwe cijfers die per ad/concept worden bewaard. */
export interface MetaMetrics {
	impressions: number;
	spend_cents: number;
	clicks: number;
	link_clicks: number;
	purchases: number;
	purchase_value_cents: number;
	video_3s: number;
	thruplays: number;
	dagen_actief: number;
	eerste_gezien_at: string | null;
	venster_van: string;
	venster_tot: string;
	bijgewerkt_at: string;
}

/** Menselijke omschrijving van de laatste sync-status. */
export function syncStatusLabel(status: string | null | undefined): string {
	if (status === 'success') return 'Laatste sync geslaagd';
	if (status === 'error') return 'Laatste sync mislukt';
	return 'Nog niet gesynchroniseerd';
}
