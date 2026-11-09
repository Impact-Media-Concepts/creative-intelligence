import type { Funnelfase, Prioriteit, ConceptStatus } from './supabase/database.types';
import { BEWUSTZIJN_LABELS, bewustzijnVan } from './trigger-map';

/** Dropdown-opties voor de variabelenmatrix (uit de briefing). */
export const FUNNELFASES: Funnelfase[] = ['TOFU', 'MOFU', 'BOFU'];
export const FORMATS = [
	'Video UGC',
	'Video',
	'AI video',
	'Static',
	'AI static',
	'Motion graphic',
	'Carousel',
	'Anders'
] as const;
export const STRUCTUREN = [
	'GRWM',
	'Probleem-oplossing',
	'POV',
	'Testimonial',
	'Dag-in-het-leven',
	'Benefit bullets',
	'Anders'
] as const;
// Welke variabele je test is vrij te kiezen — geen opgelegde volgorde meer.
export const TEST_VARIABELEN = [
	'Invalshoek',
	'Aanbod',
	'Format',
	'Structuur',
	'Creator',
	'Hook',
	'Anders'
] as const;
export const PRIORITEITEN: Prioriteit[] = ['Hoog', 'Middel', 'Laag'];
export const CONCEPT_STATUSSEN: ConceptStatus[] = ['Idee', 'In productie', 'Live', 'Afgerond'];

/** Bewustwordingsfasen (5 stages of awareness) — verfijning van de funnelfase. */
export const AWARENESS_FASEN = [
	'Onbewust',
	'Probleembewust',
	'Oplossingsbewust',
	'Productbewust',
	'Meest bewust'
] as const;

/** Veelgebruikte call-to-actions (vrije invoer blijft mogelijk). */
export const CTA_SUGGESTIES = [
	'Shop nu',
	'Bekijk collectie',
	'Meer informatie',
	'Aanmelden',
	'Download',
	'Boek een gesprek'
] as const;

/**
 * Aanbevolen testvolgorde (indicatief, niet verplicht): meestal test je eerst de
 * invalshoek. Maar je bent vrij om met een andere as te beginnen — bijv. format/creator
 * eerst als een shoot dat stuurt.
 */
export const TESTVOLGORDE = ['Invalshoek', 'Format', 'Structuur', 'Creator'] as const;

const PRIO_ORDER: Record<string, number> = { Hoog: 0, Middel: 1, Laag: 2 };

/** Volgorde Onbewust → Meest bewust; zonder fase (ook geen funnelfase) helemaal achteraan. */
function bewustzijnRang(c: { awareness?: string | null; funnelfase?: string | null }): number {
	return c.awareness || c.funnelfase ? BEWUSTZIJN_LABELS.indexOf(bewustzijnVan(c)) : 99;
}

export interface SorteerbaarConcept {
	funnelfase: Funnelfase | null;
	awareness?: string | null;
	prioriteit: Prioriteit | null;
	volgorde: number | null;
	created_at: string;
}

/**
 * Sorteert primair op handmatige `volgorde` (slepen); zolang die niet gezet is (null) valt 'ie
 * terug op bewustzijnsfase (Onbewust→Meest bewust) → prioriteit (Hoog→Laag) → aanmaakdatum. Zo gedraagt een
 * ongeordende matrix zich als voorheen, en neemt zodra je sleept de handmatige volgorde het over.
 */
export function sorteerConcepten<T extends SorteerbaarConcept>(concepten: T[]): T[] {
	return [...concepten].sort((a, b) => {
		const va = a.volgorde ?? Number.MAX_SAFE_INTEGER;
		const vb = b.volgorde ?? Number.MAX_SAFE_INTEGER;
		if (va !== vb) return va - vb;
		const fa = bewustzijnRang(a);
		const fb = bewustzijnRang(b);
		if (fa !== fb) return fa - fb;
		const pa = a.prioriteit ? PRIO_ORDER[a.prioriteit] : 99;
		const pb = b.prioriteit ? PRIO_ORDER[b.prioriteit] : 99;
		if (pa !== pb) return pa - pb;
		return (a.created_at ?? '').localeCompare(b.created_at ?? '');
	});
}
