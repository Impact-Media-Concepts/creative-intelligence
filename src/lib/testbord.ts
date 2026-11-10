/**
 * Testbord — de tests van een klant als boom (zuivere logica, geen netwerk).
 *
 *   Doel (campagnetype)  →  Test (één variabele binnen één bewustzijnsfase)  →  Varianten
 *
 * Er kunnen meerdere doelen/campagnes naast elkaar draaien (aankoop/ASC, leads, traffic, …). Een persona-niveau
 * tonen we pas als concepten per persona zijn vastgelegd; zolang dat niet zo is, blijft de boom bewust ondiep.
 * De uitslag per test komt uit `berekenResultaten`, zodat Testbord en Sprint nooit afwijken.
 */

import { berekenResultaten, type GroepResultaat, type LidResultaat, type ResConcept } from './resultaten';
import { BEWUSTZIJN_FASEN } from './trigger-map';

export interface Doel {
	sleutel: string;
	label: string;
	uitleg: string;
}

export const STANDAARD_DOEL = 'Aankoop';

export const DOELEN: Doel[] = [
	{ sleutel: 'Aankoop', label: 'Aankoop', uitleg: 'Webshop-campagnes (bv. Advantage+ Shopping): omzet en ROAS.' },
	{ sleutel: 'Leads', label: 'Leads', uitleg: 'Aanvragen en leads: wie levert de meeste leads voor de laagste kosten?' },
	{ sleutel: 'Traffic', label: 'Traffic', uitleg: 'Bezoekers naar de site: klikken en kosten per klik.' },
	{ sleutel: 'Awareness', label: 'Awareness', uitleg: 'Bereik en aandacht: kijktijd en hook rate.' }
];

export interface TestbordConcept extends ResConcept {
	doel?: string | null;
	hook: string | null;
	format: string | null;
	structuur: string | null;
	creator_type: string | null;
	aanbod: string | null;
	cta: string | null;
	status: string;
	script?: unknown;
	hold_rate?: number | null;
	observatie?: string | null;
	/** Rondenummer van de test (migratie 0017); null = van vóór de rondes. */
	ronde?: number | null;
}

export interface TestbordVariant {
	concept: TestbordConcept;
	lid: LidResultaat;
	/** De waarde van de geteste variabele: dát verschilt tussen de varianten. */
	verschil: string;
}

export interface TestbordTest {
	groep: GroepResultaat;
	varianten: TestbordVariant[];
}

export interface TestbordDoel extends Doel {
	tests: TestbordTest[];
	aantalVarianten: number;
}

export const doelVan = (c: { doel?: string | null }): string => (c.doel ?? '').trim() || STANDAARD_DOEL;

/** Wat verschilt er tussen de varianten van deze test? */
export function verschilWaarde(c: TestbordConcept, variabele: string): string {
	const pak = (v: string | null) => (v ?? '').trim();
	switch (variabele) {
		case 'Aanbod':
			return pak(c.aanbod) || pak(c.invalshoek);
		case 'Format':
			return pak(c.format) || pak(c.invalshoek);
		case 'Structuur':
			return pak(c.structuur) || pak(c.invalshoek);
		case 'Creator':
			return pak(c.creator_type) || pak(c.invalshoek);
		case 'Hook':
			return pak(c.hook) || pak(c.invalshoek);
		default:
			return pak(c.invalshoek);
	}
}

// Bottom-up: de fase dichtst bij conversie (Meest bewust) eerst, zoals in de strategie.
const FASE_RANG = new Map<string, number>(BEWUSTZIJN_FASEN.map((f, i) => [f.label, i]));

export function bouwTestbord(concepten: TestbordConcept[]): TestbordDoel[] {
	const perDoel = new Map<string, TestbordConcept[]>();
	for (const c of concepten) {
		const d = doelVan(c);
		perDoel.set(d, [...(perDoel.get(d) ?? []), c]);
	}

	const bekend = new Map(DOELEN.map((d) => [d.sleutel, d]));
	const volgorde = [...perDoel.keys()].sort((a, b) => {
		const ia = DOELEN.findIndex((d) => d.sleutel === a);
		const ib = DOELEN.findIndex((d) => d.sleutel === b);
		if (ia >= 0 && ib >= 0) return ia - ib;
		if (ia >= 0) return -1;
		if (ib >= 0) return 1;
		return a.localeCompare(b, 'nl');
	});

	return volgorde.map((sleutel) => {
		const leden = perDoel.get(sleutel) ?? [];
		const perId = new Map(leden.map((c) => [c.id, c]));
		const tests: TestbordTest[] = berekenResultaten(leden)
			.map((groep) => ({
				groep,
				varianten: groep.leden
					.map((lid) => ({ lid, concept: perId.get(lid.id) }))
					.filter((x): x is { lid: LidResultaat; concept: TestbordConcept } => !!x.concept)
					.map(({ lid, concept }) => ({ lid, concept, verschil: verschilWaarde(concept, groep.variabele) }))
			}))
			.sort(
				(a, b) =>
					(FASE_RANG.get(b.groep.fase) ?? 0) - (FASE_RANG.get(a.groep.fase) ?? 0) ||
					a.groep.variabele.localeCompare(b.groep.variabele, 'nl')
			);
		const info = bekend.get(sleutel) ?? { sleutel, label: sleutel, uitleg: 'Eigen doel: bepaal zelf waarop je de varianten vergelijkt.' };
		return { ...info, tests, aantalVarianten: leden.length };
	});
}

/**
 * Splitst de concepten in "deze ronde" en "eerdere varianten". Zolang er nog geen rondenummers zijn
 * (migratie 0017 niet gedraaid of nog geen set gemaakt), hoort alles bij de huidige ronde.
 */
export function splitsRonde(concepten: TestbordConcept[]): {
	huidig: number | null;
	actueel: TestbordConcept[];
	eerder: TestbordConcept[];
} {
	const nummers = concepten.map((c) => c.ronde).filter((n): n is number => typeof n === 'number');
	if (nummers.length === 0) return { huidig: null, actueel: concepten, eerder: [] };
	const huidig = Math.max(...nummers);
	return {
		huidig,
		actueel: concepten.filter((c) => c.ronde === huidig),
		eerder: concepten.filter((c) => c.ronde !== huidig)
	};
}
