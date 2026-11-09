import { claudeJSON } from './claude';
import type { Script, Advertentie } from '$lib/productie';
import { bewustzijnVan } from '$lib/trigger-map';

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		hook: { type: 'string' },
		probleem: { type: 'string' },
		oplossing: { type: 'string' },
		resultaat: { type: 'string' },
		cta: { type: 'string' }
	},
	required: ['hook', 'probleem', 'oplossing', 'resultaat', 'cta']
};

const SYSTEM = `Je bent een creatief scriptschrijver voor korte social video-ads (Meta/TikTok). Je schrijft een kort, concreet script in exact 5 beats:
- hook: de eerste 0–3 seconden — waarmee de kijker stopt met scrollen (visueel/auditief/tekstueel).
- probleem: het pijnpunt dat de doelgroep herkent.
- oplossing: hoe het aanbod dat concreet oplost.
- resultaat: het resultaat/gevoel vanuit de persoon zelf.
- cta: de call-to-action (mag in-camera gezegd worden; de Meta-knop staat er al).

Regels: kort en filmisch (regie-aanwijzingen mogen), Nederlands, sluit aan op de gegeven invalshoek/aanbod/format/creator. Geen algemeenheden.
Geef UITSLUITEND JSON: {"hook":"...","probleem":"...","oplossing":"...","resultaat":"...","cta":"..."}`;

interface ScriptConcept {
	aanbod: string | null;
	invalshoek: string | null;
	funnelfase: string | null;
	awareness?: string | null;
	format: string | null;
	structuur: string | null;
	creator_type: string | null;
	hook: string | null;
	cta: string | null;
	hypothese: string | null;
}

interface TmContext {
	pijnpunten?: string[];
	wensen?: string[];
	bezwaren?: string[];
	taal_doelgroep?: string[];
}

/** Genereert een 5-beats script voor één concept, met de trigger map als context. */
export async function genereerScript(concept: ScriptConcept, tm: TmContext) {
	const lijst = (v?: string[]) => (v && v.length ? v.join('; ') : '—');
	const prompt =
		`Schrijf het script voor dit concept:\n` +
		`- Aanbod: ${concept.aanbod || '—'}\n` +
		`- Invalshoek: ${concept.invalshoek || '—'} (${concept.funnelfase || concept.awareness ? bewustzijnVan(concept) : '?'})\n` +
		`- Format: ${concept.format || '—'} · Structuur: ${concept.structuur || '—'}\n` +
		`- Creator: ${concept.creator_type || '—'}\n` +
		`- Hook-idee (indien gegeven): ${concept.hook || '—'}\n` +
		`- CTA: ${concept.cta || '—'}\n` +
		`- Hypothese: ${concept.hypothese || '—'}\n\n` +
		`Context uit de trigger map:\n` +
		`- Pijnpunten: ${lijst(tm.pijnpunten)}\n` +
		`- Wensen: ${lijst(tm.wensen)}\n` +
		`- Bezwaren: ${lijst(tm.bezwaren)}\n` +
		`- Taal doelgroep: ${lijst(tm.taal_doelgroep)}`;

	return claudeJSON<Script>(SYSTEM, prompt, SCHEMA, 1500, 'low');
}

const AD_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		primair: { type: 'string' },
		kop: { type: 'string' },
		omschrijving: { type: 'string' }
	},
	required: ['primair', 'kop', 'omschrijving']
};

const AD_SYSTEM = `Je bent een copywriter voor Meta-advertenties (Facebook/Instagram feed en stories) bij een Social Ads bureau. Je schrijft de advertentietekst bij één creative-concept.

Geef UITSLUITEND JSON: {"primair":"...","kop":"...","omschrijving":"..."}

- "primair": de primaire tekst boven de creative. De EERSTE regel moet de scroll stoppen en wordt in de feed als enige getoond voordat 'Meer tonen' verschijnt — houd die ±125 tekens. Totaal maximaal ±300 tekens, korte regels, regelovergangen mogen.
- "kop": de vetgedrukte kop naast de knop, maximaal 40 tekens.
- "omschrijving": optionele regel onder de kop, maximaal 30 tekens; laat leeg ("") als die niets toevoegt.

Regels:
- Schrijf in het Nederlands, in de taal van de doelgroep, en sluit aan op de invalshoek, de hook en het script van het concept.
- De bewustzijnsfase bepaalt de taak van de tekst (Onbewust: vertel een verhaal; Probleembewust: benoem de pijn; Oplossingsbewust: jouw aanpak vs. de rest; Productbewust: bewijs en bezwaren; Meest bewust: prijs en deadline). Houd je daaraan: vóór Oplossingsbewust géén product, USP's of aanbod.
- VERZIN NOOIT feiten, cijfers, kortingen, testresultaten of claims die niet in de aangeleverde data staan.
- De call-to-action-knop staat er al; herhaal die niet als "klik hier". Spaarzaam met uitroeptekens en emoji (hooguit één).`;

/** Schrijft de advertentietekst (primair/kop/omschrijving) bij één concept. */
export async function genereerAdvertentie(
	concept: ScriptConcept & { script?: unknown },
	tm: TmContext
) {
	const lijst = (v?: string[]) => (v && v.length ? v.join('; ') : '—');
	const s = (concept.script && typeof concept.script === 'object' ? concept.script : {}) as Record<string, unknown>;
	const beat = (k: string) => (s[k] ? String(s[k]) : '');
	const fase = concept.funnelfase || concept.awareness ? bewustzijnVan(concept) : '—';
	const prompt =
		`Schrijf de advertentietekst voor dit concept:
` +
		`- Bewustzijnsfase: ${fase}
` +
		`- Aanbod: ${concept.aanbod || '—'}
` +
		`- Invalshoek: ${concept.invalshoek || '—'}
` +
		`- Format: ${concept.format || '—'} · Structuur: ${concept.structuur || '—'} · Creator: ${concept.creator_type || '—'}
` +
		`- Hook (concept): ${concept.hook || '—'}
` +
		`- CTA-knop: ${concept.cta || '—'}
` +
		`- Hypothese: ${concept.hypothese || '—'}
` +
		(beat('hook') || beat('probleem') || beat('oplossing')
			? `
Script van de creative:
- Hook: ${beat('hook') || '—'}
- Probleem: ${beat('probleem') || '—'}
- Oplossing: ${beat('oplossing') || '—'}
- Resultaat: ${beat('resultaat') || '—'}
`
			: '') +
		`
Context uit de trigger map:
` +
		`- Pijnpunten: ${lijst(tm.pijnpunten)}
` +
		`- Wensen: ${lijst(tm.wensen)}
` +
		`- Bezwaren: ${lijst(tm.bezwaren)}
` +
		`- Taal doelgroep: ${lijst(tm.taal_doelgroep)}`;

	const res = await claudeJSON<Partial<Advertentie>>(AD_SYSTEM, prompt, AD_SCHEMA, 1500, 'low');
	// De proxy dwingt het schema niet af → valideren en begrenzen.
	const advertentie: Advertentie = {
		primair: String(res.data.primair ?? '').trim().slice(0, 700),
		kop: String(res.data.kop ?? '').trim().slice(0, 120),
		omschrijving: String(res.data.omschrijving ?? '').trim().slice(0, 90)
	};
	return { ...res, advertentie };
}
