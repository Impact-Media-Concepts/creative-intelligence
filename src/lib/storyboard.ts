/**
 * Storyboard — de visuele briefing per concept (zuivere logica, geen netwerk).
 *
 * Een concept wordt een blad met scènes: wat wordt er GEZEGD (het script) en wat ZIE je (de beeldaanwijzing).
 * Video, carousel en statisch krijgen elk een eigen vorm, zodat een designer of creator in één blik weet wat te maken.
 */

import { SCRIPT_BEATS, normAdvertentie, type Script, type ScriptBeat } from './productie';
import { isCarouselFormat, isStatischFormat } from './sprint';

export type BladSoort = 'video' | 'carousel' | 'static';

export function bladSoort(format?: string | null): BladSoort {
	if (isStatischFormat(format)) return 'static';
	if (isCarouselFormat(format)) return 'carousel';
	return 'video';
}

export interface Scene {
	beat: ScriptBeat;
	nummer: number;
	/** Naam van de scène, aangepast aan het formaat (bv. "Kaart 2" of "Eye-catcher"). */
	label: string;
	/** Wat de beat inhoudelijk is (Hook, Probleem, …). */
	beatNaam: string;
	/** Wat er gezegd of getoond wordt volgens het script. */
	tekst: string;
	/** Wat je ziet (beeldaanwijzing). */
	beeld: string;
}

/** Leest het script uit het JSON-veld, inclusief de beeldaanwijzingen. */
export function leesScriptMetBeeld(raw: unknown): (Script & { beeld: Partial<Record<ScriptBeat, string>> }) | null {
	if (!raw || typeof raw !== 'object') return null;
	const s = raw as Record<string, unknown>;
	const beeldRaw = s.beeld && typeof s.beeld === 'object' ? (s.beeld as Record<string, unknown>) : {};
	const beeld: Partial<Record<ScriptBeat, string>> = {};
	for (const b of SCRIPT_BEATS) if (beeldRaw[b.key] != null) beeld[b.key] = String(beeldRaw[b.key]);
	const script = {
		hook: String(s.hook ?? ''),
		probleem: String(s.probleem ?? ''),
		oplossing: String(s.oplossing ?? ''),
		resultaat: String(s.resultaat ?? ''),
		cta: String(s.cta ?? ''),
		advertentie: normAdvertentie(s.advertentie),
		beeld
	};
	const heeftInhoud = SCRIPT_BEATS.some((b) => script[b.key].trim());
	return heeftInhoud ? script : null;
}

const NAAM: Record<BladSoort, Record<ScriptBeat, string>> = {
	video: { hook: 'Hook (0–3s)', probleem: 'Probleem', oplossing: 'Oplossing', resultaat: 'Resultaat', cta: 'CTA' },
	carousel: { hook: 'Kaart 1', probleem: 'Kaart 2', oplossing: 'Kaart 3', resultaat: 'Kaart 4', cta: 'Kaart 5' },
	static: { hook: 'Eye-catcher', probleem: 'Probleem', oplossing: 'Oplossing', resultaat: 'Resultaat', cta: 'CTA' }
};

export function bouwScenes(
	script: { [K in ScriptBeat]: string } & { beeld?: Partial<Record<ScriptBeat, string>> },
	soort: BladSoort,
	beeld: Partial<Record<ScriptBeat, string>> = script.beeld ?? {}
): Scene[] {
	return SCRIPT_BEATS.map((b, i) => ({
		beat: b.key,
		nummer: i + 1,
		label: NAAM[soort][b.key],
		beatNaam: b.label.replace(/ \(.*\)$/, ''),
		tekst: (script[b.key] ?? '').trim(),
		beeld: (beeld[b.key] ?? '').trim()
	}));
}

/** Splitst de props/benodigdheden in losse punten (komma, puntkomma of regel). */
export function splitProps(props: string | null | undefined): string[] {
	return (props ?? '')
		.split(/[,;\n]+/)
		.map((p) => p.trim())
		.filter(Boolean)
		.slice(0, 20);
}

/** Is de referentie een link? Zo ja, genormaliseerd; anders null (dan tonen we de tekst). */
export function referentieLink(ref: string | null | undefined): string | null {
	const t = (ref ?? '').trim();
	if (!t) return null;
	if (/^https?:\/\//i.test(t)) return t;
	if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(t)) return 'https://' + t;
	return null;
}
