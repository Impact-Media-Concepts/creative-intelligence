import { claudeJSON } from './claude';
import type { Script } from '$lib/productie';

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
		`- Invalshoek: ${concept.invalshoek || '—'} (${concept.funnelfase || '?'})\n` +
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
