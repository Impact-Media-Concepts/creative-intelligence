/** Gedeelde types voor de trigger map (client + server). */

import type { Prioriteit } from './supabase/database.types';

export type Funnelfase = 'TOFU' | 'MOFU' | 'BOFU';

/**
 * RICE-light scorekaart per invalshoek — de transparante, controleerbare basis
 * voor de prioriteit in de matrix. Elke factor op Laag/Middel/Hoog.
 * - bereik:       hoe groot/belangrijk is het persona-segment dat de invalshoek raakt (Reach)
 * - impact:       hoe sterk raakt 'ie een kernpijnpunt/wens/bezwaar (Impact)
 * - bewijskracht: hoe sterk ondersteunt de intake-data deze invalshoek (Confidence)
 * - effort:       productie-inspanning van het type creative dat 'ie vraagt (Hoog = zwaarder)
 */
export type ScoreNiveau = 'Laag' | 'Middel' | 'Hoog';
export const SCORE_NIVEAUS: ScoreNiveau[] = ['Laag', 'Middel', 'Hoog'];

export interface InvalshoekScore {
	bereik: ScoreNiveau;
	impact: ScoreNiveau;
	bewijskracht: ScoreNiveau;
	effort: ScoreNiveau;
	/** Korte verantwoording van de scores (door AI voorgesteld, door de strateeg te controleren). */
	toelichting?: string;
}

/** Labels + uitleg per score-factor, in weergavevolgorde. */
export const SCORE_FACTOREN: Array<{ key: keyof InvalshoekScore; label: string; hint: string }> = [
	{ key: 'bereik', label: 'Bereik', hint: 'Hoe groot/belangrijk is het persona-segment dat dit raakt?' },
	{ key: 'impact', label: 'Impact', hint: 'Hoe sterk raakt het een kernpijnpunt/wens/bezwaar?' },
	{ key: 'bewijskracht', label: 'Bewijskracht', hint: 'Hoe sterk ondersteunt de intake-data dit?' },
	{ key: 'effort', label: 'Effort', hint: 'Productie-inspanning (Hoog = zwaarder/duurder).' }
];

const NIVEAU_WAARDE: Record<ScoreNiveau, number> = { Laag: 1, Middel: 2, Hoog: 3 };

/** RICE-light score: (Bereik × Impact × Bewijskracht) / Effort. Hoger = hogere prioriteit. */
export function riceScore(s: InvalshoekScore): number {
	return (
		(NIVEAU_WAARDE[s.bereik] * NIVEAU_WAARDE[s.impact] * NIVEAU_WAARDE[s.bewijskracht]) /
		NIVEAU_WAARDE[s.effort]
	);
}

/** Afgeleide prioriteit uit de scorekaart (deterministisch, dus navolgbaar). */
export function afgeleidePrioriteit(s: InvalshoekScore): Prioriteit {
	const r = riceScore(s);
	return r >= 8 ? 'Hoog' : r >= 3 ? 'Middel' : 'Laag';
}

/** Levenscyclus van een invalshoek — houdt de trigger map "levend". */
export type InvalshoekStatus = 'Nieuw' | 'In test' | 'Getest — werkt' | 'Getest — werkt niet';

export const INVALSHOEK_STATUSSEN: InvalshoekStatus[] = [
	'Nieuw',
	'In test',
	'Getest — werkt',
	'Getest — werkt niet'
];

export const FUNNELFASES: Funnelfase[] = ['TOFU', 'MOFU', 'BOFU'];

/**
 * Bewustzijnsfases (Eugene Schwartz, "5 stages of awareness") — de zichtbare woordenschat in de
 * tool. Elke fase heeft een "taak": wat de creative in die fase moet doen. De oude funnelfase
 * (TOFU/MOFU/BOFU) blijft intern bestaan en wordt hieruit afgeleid (zie funnelUitBewustzijn),
 * zodat bestaande klanten en AI-prompts blijven werken.
 */
export type Bewustzijn =
	| 'Onbewust'
	| 'Probleembewust'
	| 'Oplossingsbewust'
	| 'Productbewust'
	| 'Meest bewust';

export const BEWUSTZIJN_FASEN: Array<{
	label: Bewustzijn;
	/** Wat de creative in deze fase moet doen. */
	taak: string;
	/** Uitleg in gewone taal voor wie geen Social-kennis heeft. */
	uitleg: string;
	/** Legacy-funnelfase waar deze fase onder valt. */
	funnel: Funnelfase;
	/** Badge-kleur (rand + vulling + tekst), oplopend van koel naar warm-groen. */
	kleur: string;
}> = [
	{ label: 'Onbewust', taak: 'Vertel een verhaal', uitleg: 'Ze weten nog niet dat ze een probleem hebben.', funnel: 'TOFU', kleur: 'border-blue-300 bg-blue-100 text-blue-800' },
	{ label: 'Probleembewust', taak: 'Benoem de pijn', uitleg: 'Ze voelen het probleem, maar kennen de oplossing niet.', funnel: 'TOFU', kleur: 'border-orange-300 bg-orange-100 text-orange-800' },
	{ label: 'Oplossingsbewust', taak: 'Jouw aanpak vs. de rest', uitleg: 'Ze zoeken een oplossing en vergelijken opties.', funnel: 'MOFU', kleur: 'border-lime-300 bg-lime-100 text-lime-900' },
	{ label: 'Productbewust', taak: 'Bewijs & bezwaren', uitleg: 'Ze kennen je product en twijfelen nog.', funnel: 'BOFU', kleur: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green' },
	{ label: 'Meest bewust', taak: 'Prijs & deadline', uitleg: 'Ze willen eigenlijk al kopen; geef een duw.', funnel: 'BOFU', kleur: 'border-brand-green bg-brand-green text-white' }
];

export const BEWUSTZIJN_LABELS: Bewustzijn[] = BEWUSTZIJN_FASEN.map((f) => f.label);

/** Badge-kleur per bewustzijnsfase (op label). */
export const BEWUSTZIJN_KLEUR: Record<string, string> = Object.fromEntries(
	BEWUSTZIJN_FASEN.map((f) => [f.label, f.kleur])
);

/** Taak van een bewustzijnsfase (voor tooltips/hulptekst); leeg als onbekend. */
export function bewustzijnTaak(label: string | null | undefined): string {
	return BEWUSTZIJN_FASEN.find((f) => f.label === label)?.taak ?? '';
}

/** Terugval voor oudere data zonder bewustzijn: TOFU→Probleembewust, MOFU→Oplossingsbewust, BOFU→Productbewust. */
export function bewustzijnUitFunnel(f: string | null | undefined): Bewustzijn {
	return f === 'BOFU' ? 'Productbewust' : f === 'MOFU' ? 'Oplossingsbewust' : 'Probleembewust';
}

/** Legacy-funnelfase voor een bewustzijnsfase (houdt de oude kolom/AI-prompts in sync). */
export function funnelUitBewustzijn(b: string | null | undefined): Funnelfase {
	return BEWUSTZIJN_FASEN.find((f) => f.label === b)?.funnel ?? 'TOFU';
}

/** Bewustzijnsfase van een invalshoek of concept: eigen waarde, anders afgeleid uit de funnelfase. */
export function bewustzijnVan(x: {
	bewustzijn?: string | null;
	awareness?: string | null;
	funnelfase?: string | null;
}): Bewustzijn {
	const eigen = x.bewustzijn ?? x.awareness;
	return BEWUSTZIJN_LABELS.includes(eigen as Bewustzijn)
		? (eigen as Bewustzijn)
		: bewustzijnUitFunnel(x.funnelfase);
}

export interface Invalshoek {
	naam: string;
	omschrijving: string;
	funnelfase: Funnelfase;
	/** Bewustzijnsfase (zichtbaar in de UI); ontbreekt op oudere data → afgeleid uit funnelfase. */
	bewustzijn?: Bewustzijn;
	onderbouwing: string;
	/** Levenscyclus-status; ontbreekt op oudere data → behandeld als 'Nieuw'. */
	status?: InvalshoekStatus;
	/** Gearchiveerde invalshoeken tellen niet meer mee en verschijnen niet in de matrix. */
	gearchiveerd?: boolean;
	/** RICE-light scorekaart; ontbreekt tot 'Scores voorstellen' is gedraaid of handmatig ingevuld. */
	score?: InvalshoekScore;
}

/** Status van een invalshoek, met terugval op 'Nieuw' voor oudere data. */
export function invalshoekStatus(inv: Invalshoek): InvalshoekStatus {
	return inv.status ?? 'Nieuw';
}

/** Doelgroep-segment / persona — voedt de invalshoeken én het testplan. */
export interface Persona {
	naam: string;
	omschrijving: string;
	kernbehoefte: string;
	kernbezwaar: string;
}

export interface TriggerMapData {
	pijnpunten: string[];
	wensen: string[];
	bezwaren: string[];
	taal_doelgroep: string[];
	routines: string[];
	kansen_vs_concurrenten: string[];
	personas: Persona[];
	invalshoeken: Invalshoek[];
}

/** Secties met een label, in weergavevolgorde. Sleutels = kolommen in trigger_map_versions. */
export const TRIGGER_MAP_SECTIES = [
	{ key: 'pijnpunten', label: 'Pijnpunten' },
	{ key: 'wensen', label: 'Wensen' },
	{ key: 'bezwaren', label: 'Bezwaren' },
	{ key: 'taal_doelgroep', label: 'Taal van de doelgroep' },
	{ key: 'routines', label: 'Routines' },
	{ key: 'kansen_vs_concurrenten', label: 'Kansen t.o.v. concurrenten' }
] as const;

export type TekstSectieKey = (typeof TRIGGER_MAP_SECTIES)[number]['key'];

export const LEGE_TRIGGER_MAP: TriggerMapData = {
	pijnpunten: [],
	wensen: [],
	bezwaren: [],
	taal_doelgroep: [],
	routines: [],
	kansen_vs_concurrenten: [],
	personas: [],
	invalshoeken: []
};
