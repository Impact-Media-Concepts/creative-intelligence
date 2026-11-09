import { claudeJSON } from './claude';
import type { ScoreNiveau } from '$lib/trigger-map';

export interface VoorgesteldeScore {
	naam: string;
	bereik: ScoreNiveau;
	impact: ScoreNiveau;
	bewijskracht: ScoreNiveau;
	effort: ScoreNiveau;
	toelichting: string;
}

interface ScoringContext {
	invalshoeken: Array<{
		naam?: string;
		omschrijving?: string;
		onderbouwing?: string;
		bewustzijn?: string;
	}>;
	personas?: Array<{ naam?: string; omschrijving?: string; kernbehoefte?: string; kernbezwaar?: string }>;
	pijnpunten?: string[];
	wensen?: string[];
	bezwaren?: string[];
	kansen_vs_concurrenten?: string[];
}

const SCORE_ENUM = { type: 'string', enum: ['Laag', 'Middel', 'Hoog'] };

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		scores: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					naam: { type: 'string' },
					bereik: SCORE_ENUM,
					impact: SCORE_ENUM,
					bewijskracht: SCORE_ENUM,
					effort: SCORE_ENUM,
					toelichting: { type: 'string' }
				},
				required: ['naam', 'bereik', 'impact', 'bewijskracht', 'effort', 'toelichting']
			}
		}
	},
	required: ['scores']
};

const SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Je scoort elke aangeleverde invalshoek op een RICE-light scorekaart, zodat de prioriteit in de matrix transparant en navolgbaar wordt. Dit is een VOORSTEL dat de strateeg daarna controleert — wees eerlijk en onderbouwd, niet optimistisch.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "scores": [
    { "naam": "exacte naam van de invalshoek", "bereik": "Laag/Middel/Hoog", "impact": "Laag/Middel/Hoog", "bewijskracht": "Laag/Middel/Hoog", "effort": "Laag/Middel/Hoog", "toelichting": "..." }
  ]
}

Scoor elke invalshoek op vier factoren (Laag/Middel/Hoog):
- "bereik" (Reach): hoe groot of belangrijk is het persona-segment dat deze invalshoek raakt? Raakt 'ie meerdere/belangrijke persona's → hoger. Let ook op de bewustzijnsfase: Onbewust/Probleembewust spreekt de grootste groep aan, Meest bewust de kleinste (maar warmste) — weeg dat mee in het bereik.
- "impact" (Impact): hoe sterk raakt 'ie een KERN-pijnpunt/wens/bezwaar (vs. een randonderwerp)? Direct op een groot pijnpunt → hoger.
- "bewijskracht" (Confidence): hoe sterk ondersteunt de intake-data dit? Als meerdere onafhankelijke signalen (klantgesprek + reviews + eigen data + concurrentie) in dezelfde richting wijzen → Hoog. Slechts één zwak signaal of veel aanname → Laag.
- "effort" (Effort): hoeveel productie-inspanning vraagt het type creative dat bij deze invalshoek past? Simpele static/tekst → Laag; opgezette UGC-video met klant/acteur, meerdere scènes → Hoog. (Let op: Hoog betekent MEER werk, dus lagere prioriteit.)

Regels:
- Geef een score voor ELKE aangeleverde invalshoek; zet in "naam" exact de naam zoals tussen aanhalingstekens gegeven — ZONDER de bewustzijnsfase of andere prefix ervoor.
- "toelichting": 1-2 zinnen die je scores verantwoorden, met verwijzing naar concrete data (welk pijnpunt/segment/bron). Dit is de controle die de strateeg leest.
- Wees onderscheidend: niet alles Hoog. Durf Laag/Middel te geven waar de data dat rechtvaardigt.
- Taal: Nederlands. Baseer je uitsluitend op de aangeleverde data.`;

/** Laat Claude een RICE-light score per invalshoek voorstellen (voorstel; strateeg controleert). */
export async function genereerInvalshoekScores(ctx: ScoringContext) {
	const context = [
		'## Invalshoeken om te scoren',
		ctx.invalshoeken
			.map(
				(i) =>
					`- Naam: "${i.naam ?? ''}" · Bewustzijnsfase: ${i.bewustzijn ?? '?'}\n    ${i.omschrijving ?? ''}` +
					(i.onderbouwing ? `\n    Onderbouwing: ${i.onderbouwing}` : '')
			)
			.join('\n'),
		ctx.personas?.length
			? "## Persona's\n" +
				ctx.personas
					.map(
						(p) =>
							`- ${p.naam ?? ''}: ${p.omschrijving ?? ''} (behoefte: ${p.kernbehoefte ?? '?'}; bezwaar: ${p.kernbezwaar ?? '?'})`
					)
					.join('\n')
			: '',
		ctx.pijnpunten?.length ? `## Pijnpunten\n${ctx.pijnpunten.join('; ')}` : '',
		ctx.wensen?.length ? `## Wensen\n${ctx.wensen.join('; ')}` : '',
		ctx.bezwaren?.length ? `## Bezwaren\n${ctx.bezwaren.join('; ')}` : '',
		ctx.kansen_vs_concurrenten?.length ? `## Kansen t.o.v. concurrenten\n${ctx.kansen_vs_concurrenten.join('; ')}` : ''
	]
		.filter(Boolean)
		.join('\n\n');

	// effort 'low': het is een gestructureerde beoordeling met alle context al aangeleverd.
	return claudeJSON<{ scores: VoorgesteldeScore[] }>(SYSTEM, context, SCHEMA, 16000, 'low');
}
