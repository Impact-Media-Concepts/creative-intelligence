import { claudeJSON } from './claude';
import type { Testplan } from '$lib/testplan';
import { bewustzijnVan } from '$lib/trigger-map';

export interface TestplanConcept {
	funnelfase: string | null;
	awareness?: string | null;
	invalshoek: string | null;
	format: string | null;
	structuur: string | null;
	variabele: string | null;
	prioriteit: string | null;
}

interface TestplanInput {
	personas: Array<{ naam?: string; omschrijving?: string; kernbehoefte?: string; kernbezwaar?: string }>;
	concepten: TestplanConcept[];
	pijnpunten?: string[];
	wensen?: string[];
	/** Optionele feedback van de gebruiker om het plan te verfijnen. */
	feedback?: string;
}

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		toelichting: { type: 'string' },
		sprints: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					titel: { type: 'string' },
					focus: { type: 'string' },
					concepten: { type: 'array', items: { type: 'string' } },
					wat_testen: { type: 'string' },
					succescriterium: { type: 'string' },
					budget: { type: 'string' },
					duur: { type: 'string' }
				},
				required: ['titel', 'focus', 'concepten', 'wat_testen', 'succescriterium', 'budget', 'duur']
			}
		}
	},
	required: ['toelichting', 'sprints']
};

const SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Op basis van de variabelenmatrix (de te testen concepten), de persona's en de trigger map maak je een concreet stap-voor-stap testplan: in welke sprints test je wat, en waarom in die volgorde.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "toelichting": "2-4 zinnen: waarom deze volgorde, wat is de rode draad, waar begin je en waarom",
  "sprints": [
    { "titel": "Sprint 1 — ...", "focus": "welke persona + bewustzijnsfase", "concepten": ["invalshoek A", "invalshoek B"], "wat_testen": "welke variabele/hypothese", "succescriterium": "concreet en meetbaar", "budget": "bijv. €900 testbudget", "duur": "bijv. 2 weken" }
  ]
}

Richtlijnen:
- Bouw het plan rond de persona's: activeer per sprint (een van) de persona's, en verwijs in "concepten" naar de invalshoeken uit de matrix die daarbij horen.
- Eerste sprints: test de INVALSHOEK per bewustzijnsfase (dat is de eerste variabele), bottom-up: begin bij de fases het dichtst bij conversie (Meest bewust/Productbewust/Oplossingsbewust) en schaal daarna op naar Probleembewust en Onbewust. Latere sprints: optimaliseer format/structuur/creator van de winnende invalshoek.
- Dek de bewustzijnsfases af die in de matrix voorkomen; wees concreet over succescriteria (hook rate, CTR, ROAS, CPA, saves) passend bij de fase (vroege fases: hook rate/CTR/saves; late fases: ROAS/CPA).
- Houd het realistisch: 4-6 sprints, oplopende budgetten, korte duur per sprint.
- "concepten" bevat de namen van de invalshoeken/concepten uit de aangeleverde matrix — verzin geen nieuwe.
- Taal: Nederlands. Baseer je op de aangeleverde data — geen aannames.`;

/** Genereert een testplan op basis van matrix + persona's + trigger map (met optionele feedback). */
export async function genereerTestplan(input: TestplanInput) {
	const personaTekst = input.personas.length
		? input.personas
				.map(
					(p) =>
						`- ${p.naam ?? ''}: ${p.omschrijving ?? ''} (behoefte: ${p.kernbehoefte ?? '?'}; bezwaar: ${p.kernbezwaar ?? '?'})`
				)
				.join('\n')
		: '(geen persona\'s gedefinieerd — leid segmenten af uit de concepten)';

	const conceptTekst = input.concepten.length
		? input.concepten
				.map(
					(c) =>
						`- [${bewustzijnVan(c)}] ${c.invalshoek ?? '(geen invalshoek)'} · ${c.format ?? '?'} · ${c.structuur ?? '?'} · test: ${c.variabele ?? '?'} · prioriteit: ${c.prioriteit ?? '?'}`
				)
				.join('\n')
		: '(geen concepten)';

	const context = [
		'## Persona\'s',
		personaTekst,
		'## Matrix (te testen concepten)',
		conceptTekst,
		input.pijnpunten?.length ? `## Pijnpunten\n${input.pijnpunten.join('; ')}` : '',
		input.wensen?.length ? `## Wensen\n${input.wensen.join('; ')}` : '',
		input.feedback?.trim()
			? `## Feedback van de strateeg (VERWERK DIT in het plan)\n${input.feedback.trim()}`
			: ''
	]
		.filter(Boolean)
		.join('\n\n');

	return claudeJSON<Testplan>(SYSTEM, context, SCHEMA);
}
