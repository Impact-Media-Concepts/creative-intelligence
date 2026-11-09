/** Briefing-pakket: alle concepten van een klant als één document voor het contentteam of de klant. */

import { BEWUSTZIJN_FASEN, bewustzijnVan, type Bewustzijn } from './trigger-map';
import { briefSecties, type Brief } from './sprint';
import { SCRIPT_BEATS, ADVERTENTIE_VELDEN, normAdvertentie, type Script } from './productie';
import { sorteerConcepten } from './matrix';
import type { Prioriteit } from './supabase/database.types';

/** Het deel van een concept dat in het pakket terechtkomt. */
export interface PakketConcept {
	id: string;
	invalshoek: string | null;
	aanbod: string | null;
	funnelfase: 'TOFU' | 'MOFU' | 'BOFU' | null;
	awareness: string | null;
	format: string | null;
	structuur: string | null;
	creator_type: string | null;
	hypothese: string | null;
	prioriteit: Prioriteit | null;
	volgorde: number | null;
	created_at: string;
	brief: unknown;
	script: unknown;
	referentie: string | null;
	props: string | null;
}

export interface PakketGroep {
	fase: Bewustzijn;
	taak: string;
	concepten: PakketConcept[];
}

/** Sorteert en groepeert de concepten per bewustzijnsfase (Onbewust → Meest bewust). */
export function groepeerPerFase(concepten: PakketConcept[]): PakketGroep[] {
	const gesorteerd = sorteerConcepten(concepten) as PakketConcept[];
	return BEWUSTZIJN_FASEN.map((f) => ({
		fase: f.label,
		taak: f.taak,
		concepten: gesorteerd.filter((c) => bewustzijnVan(c) === f.label)
	})).filter((g) => g.concepten.length > 0);
}

export function leesBrief(c: PakketConcept): Brief | null {
	return c.brief && typeof c.brief === 'object' ? (c.brief as Brief) : null;
}

export function leesScript(c: PakketConcept): Script | null {
	if (!c.script || typeof c.script !== 'object') return null;
	const s = c.script as Record<string, unknown>;
	const script: Script = {
		hook: String(s.hook ?? ''),
		probleem: String(s.probleem ?? ''),
		oplossing: String(s.oplossing ?? ''),
		resultaat: String(s.resultaat ?? ''),
		cta: String(s.cta ?? ''),
		advertentie: normAdvertentie(s.advertentie)
	};
	const leeg =
		!script.hook && !script.probleem && !script.oplossing && !script.resultaat && !script.cta;
	const geenAd = !script.advertentie!.primair && !script.advertentie!.kop && !script.advertentie!.omschrijving;
	return leeg && geenAd ? null : script;
}

/** Eén regel met de dimensies van een concept. */
export function dimsTekst(c: PakketConcept): string {
	return [c.aanbod, c.format, c.structuur, c.creator_type].filter(Boolean).join(' · ');
}

/** Zet het hele pakket om naar Markdown (kopiëren / downloaden). Blokken met witregels, zodat het ook in Notion/Docs netjes oogt. */
export function pakketNaarMarkdown(klantNaam: string, concepten: PakketConcept[], datum: string): string {
	const delen: string[] = [`# Briefing-pakket — ${klantNaam}`, `_Samengesteld op ${datum} · ${concepten.length} concepten_`];
	for (const groep of groepeerPerFase(concepten)) {
		delen.push(`## ${groep.fase} — ${groep.taak}`);
		groep.concepten.forEach((c, i) => {
			const blokken: string[] = [`### ${i + 1}. ${c.invalshoek || '(geen invalshoek)'}`];

			// Kerngegevens: harde regeleinden (twee spaties) binnen één blok.
			const info: string[] = [];
			const dims = dimsTekst(c);
			if (dims) info.push(`**Wat:** ${dims}`);
			if (c.prioriteit) info.push(`**Prioriteit:** ${c.prioriteit}`);
			if (c.hypothese) info.push(`**Hypothese:** ${c.hypothese}`);
			if (info.length) blokken.push(info.join('  \n'));

			const brief = leesBrief(c);
			if (brief) {
				const lijst = briefSecties(c.format)
					.filter((s) => brief[s.key])
					.map((s) => `- ${s.label}: ${brief[s.key]}`);
				if (lijst.length) blokken.push('**Brief**\n\n' + lijst.join('\n'));
			}
			const script = leesScript(c);
			if (script) {
				const beats = SCRIPT_BEATS.filter((b) => script[b.key]).map((b) => `- ${b.label}: ${script[b.key]}`);
				if (beats.length) blokken.push('**Script**\n\n' + beats.join('\n'));
				const ad = ADVERTENTIE_VELDEN.filter((v) => script.advertentie?.[v.key]).map(
					(v) => `- ${v.label}: ${script.advertentie![v.key]}`
				);
				if (ad.length) blokken.push('**Advertentietekst**\n\n' + ad.join('\n'));
			}
			const extra: string[] = [];
			if (c.referentie) extra.push(`**Referentie:** ${c.referentie}`);
			if (c.props) extra.push(`**Props:** ${c.props}`);
			if (extra.length) blokken.push(extra.join('  \n'));

			delen.push(blokken.join('\n\n'));
		});
	}
	return delen.join('\n\n') + '\n';
}
