import { claudeJSON } from './claude';
import type { Brief, Analyse } from '$lib/sprint';
import { bewustzijnVan } from '$lib/trigger-map';

interface ConceptContext {
	funnelfase: string | null;
	awareness?: string | null;
	invalshoek: string | null;
	format: string | null;
	structuur: string | null;
	creator_type: string | null;
	hypothese: string | null;
	variabele: string | null;
}

interface TriggerMapContext {
	pijnpunten?: string[];
	wensen?: string[];
	bezwaren?: string[];
	taal_doelgroep?: string[];
	invalshoeken?: Array<{ naam?: string; omschrijving?: string }>;
}

const BRIEF_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		hypothese: { type: 'string' },
		wie: { type: 'string' },
		gedrag: { type: 'string' },
		format: { type: 'string' },
		structuur: { type: 'string' },
		hook: { type: 'string' },
		kern: { type: 'string' },
		cta: { type: 'string' },
		variabele: { type: 'string' },
		succes: { type: 'string' }
	},
	required: ['hypothese', 'wie', 'gedrag', 'format', 'structuur', 'hook', 'kern', 'cta', 'variabele', 'succes']
};

const ANALYSE_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		wat_werkte: { type: 'string' },
		volgende_stap: { type: 'string' }
	},
	required: ['wat_werkte', 'volgende_stap']
};

const BRIEF_SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Schrijf een concrete, uitvoerbare creative brief voor één advertentieconcept, gebaseerd op het concept en de trigger map.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "hypothese": "Wij geloven dat ... omdat ...",
  "wie": "doelgroep + bewustzijnsfase",
  "gedrag": "welk gedrag je wilt uitlokken (na 3 sec / na volledig zien)",
  "format": "concreet formaat (bijv. verticale video 9:16, 15-25 sec, UGC)",
  "structuur": "opbouw van de creative",
  "hook": "de eerste 0-3 seconden — letterlijk uitgeschreven",
  "kern": "wat er in het midden gebeurt",
  "cta": "de call-to-action",
  "variabele": "welke variabele in deze test wordt geïsoleerd en waarom",
  "succes": "meetbaar succescriterium (concrete drempel + termijn)"
}

Richtlijnen:
- Taal: Nederlands
- Concreet en uitvoerbaar — een creator moet er direct mee aan de slag kunnen
- Gebruik de taal van de doelgroep uit de trigger map waar passend
- Baseer je op het concept en de trigger map; verzin geen cijfers die er niet zijn`;

const ANALYSE_SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Analyseer de testresultaten van één advertentieconcept en bepaal wat werkte en de beste volgende stap.

Houd rekening met de testvolgorde: Invalshoek → Format → Structuur → Creator. Test steeds één variabele per keer.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "wat_werkte": "wat de cijfers en observatie laten zien (2-4 zinnen)",
  "volgende_stap": "de concrete aanbevolen volgende test of actie (2-4 zinnen)"
}

Richtlijnen:
- Taal: Nederlands
- Wees concreet en beslissend
- Benchmarks als richtlijn: hook rate >45% sterk, CTR >2% goed, ROAS >4x goed, lage CPA is beter
- Als een concept wint: adviseer de volgende variabele in de testvolgorde te testen op dit concept
- Baseer je alleen op de aangeleverde cijfers en observatie — geen aannames`;

/** Concepten-schema voor de volgende testronde (varianten van de volgende variabele). */
const VERVOLG_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		concepten: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					invalshoek: { type: 'string' },
					format: { type: 'string' },
					structuur: { type: 'string' },
					creator_type: { type: 'string' },
					hypothese: { type: 'string' },
					prioriteit: { type: 'string', enum: ['Hoog', 'Middel', 'Laag'] },
					onderbouwing: { type: 'string' }
				},
				required: [
					'invalshoek',
					'format',
					'structuur',
					'creator_type',
					'hypothese',
					'prioriteit',
					'onderbouwing'
				]
			}
		}
	},
	required: ['concepten']
};

export interface VervolgConcept {
	invalshoek: string;
	format: string;
	structuur: string;
	creator_type: string;
	hypothese: string;
	prioriteit: 'Hoog' | 'Middel' | 'Laag';
	onderbouwing: string;
}

/** Formaat-specifieke instructie zodat de brief past bij video, statisch beeld of carousel. */
function formaatInstructie(format: string | null): string {
	const f = (format ?? '').toLowerCase();
	if (f.includes('static') || f.includes('statisch')) {
		return 'FORMAAT = STATISCH BEELD (geen video). Vul "hook" als het visuele eye-catcher/openingsbeeld dat de scroll stopt — beschrijf het beeld én de headline die erop staat; GEEN tijdsaanduiding of "seconden". Vul "kern" als de kernboodschap/copy op het beeld. Vul "structuur" als de lay-out/compositie (waar staat wat: beeld, headline, subtekst, logo). Gebruik geen video-termen zoals "scène", "shot" of "seconden".';
	}
	if (f.includes('carousel') || f.includes('carrousel')) {
		return 'FORMAAT = CAROUSEL. Vul "hook" als de eerste kaart (de scroll-stopper). Vul "kern" als de opeenvolgende kaarten, kaart-voor-kaart beschreven (kaart 2, 3, ...). Vul "cta" als de laatste kaart. Geen "seconden".';
	}
	return 'FORMAAT = VIDEO/MOTION. Vul "hook" als de eerste 0-3 seconden, letterlijk uitgeschreven. Vul "kern" als wat er in het midden gebeurt (beweging/scènes). Beschrijf het als bewegend beeld.';
}

function conceptTekst(c: ConceptContext): string {
	return [
		`Bewustzijnsfase: ${c.funnelfase || c.awareness ? bewustzijnVan(c) : '—'}`,
		`Invalshoek: ${c.invalshoek ?? '—'}`,
		`Format: ${c.format ?? '—'}`,
		`Structuur: ${c.structuur ?? '—'}`,
		`Creator type: ${c.creator_type ?? '—'}`,
		`Hypothese: ${c.hypothese ?? '—'}`,
		`Te testen variabele: ${c.variabele ?? '—'}`
	].join('\n');
}

export async function genereerBrief(concept: ConceptContext, tm: TriggerMapContext) {
	const context = [
		'## Concept',
		conceptTekst(concept),
		'',
		`## Formaat-instructie (VOLG DIT strikt)\n${formaatInstructie(concept.format)}`,
		'',
		'## Trigger map (context)',
		tm.pijnpunten?.length ? `Pijnpunten: ${tm.pijnpunten.join('; ')}` : '',
		tm.wensen?.length ? `Wensen: ${tm.wensen.join('; ')}` : '',
		tm.bezwaren?.length ? `Bezwaren: ${tm.bezwaren.join('; ')}` : '',
		tm.taal_doelgroep?.length ? `Taal doelgroep: ${tm.taal_doelgroep.join('; ')}` : '',
		tm.invalshoeken?.length
			? `Invalshoeken: ${tm.invalshoeken.map((i) => `${i.naam ?? ''} — ${i.omschrijving ?? ''}`).join(' | ')}`
			: ''
	]
		.filter(Boolean)
		.join('\n');

	return claudeJSON<Brief>(BRIEF_SYSTEM, context, BRIEF_SCHEMA);
}

export async function analyseerResultaat(
	concept: ConceptContext,
	metrics: { hook_rate?: number | null; hold_rate?: number | null; ctr?: number | null; roas?: number | null; cpa?: number | null },
	observatie: string | null
) {
	const context = [
		'## Concept',
		conceptTekst(concept),
		'',
		'## Testresultaten',
		`Hook rate: ${metrics.hook_rate ?? '—'}%`,
		`Hold rate: ${metrics.hold_rate ?? '—'}%`,
		`CTR: ${metrics.ctr ?? '—'}%`,
		`ROAS: ${metrics.roas ?? '—'}x`,
		`CPA: €${metrics.cpa ?? '—'}`,
		'',
		`## Kwalitatieve observatie\n${observatie?.trim() || '(geen)'}`
	].join('\n');

	return claudeJSON<Analyse>(ANALYSE_SYSTEM, context, ANALYSE_SCHEMA);
}

const VERVOLG_SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Een concept heeft gewonnen in de vorige testronde. Volgens de testvolgorde (Invalshoek → Format → Structuur → Creator) is de volgende variabele die getest wordt aangegeven. Jouw taak: stel de volgende testronde samen.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "concepten": [
    { "invalshoek": "...", "format": "...", "structuur": "...", "creator_type": "...", "hypothese": "...", "prioriteit": "Hoog/Middel/Laag", "onderbouwing": "..." }
  ]
}

Strikte regels:
- Maak 2 tot 4 varianten die ALLEEN de aangegeven volgende variabele variëren. Alle andere dimensies (bewustzijnsfase, invalshoek, en de niet-geteste variabelen) blijven IDENTIEK aan het winnende concept — dat is schoon testen. De bewustzijnsfase hoef je niet in je output te zetten; die neemt het systeem over van de winnaar.
- Voorbeeld: als de volgende variabele "Format" is, houd je invalshoek/structuur/creator_type gelijk aan de winnaar en zet je per variant een ander format.
- "hypothese": concreet en toetsbaar, en gebruik de learning van de vorige ronde (wat werkte) als onderbouwing van je keuzes.
- "onderbouwing": 1-2 zinnen — waarom deze variant kansrijk is gegeven de winnende resultaten en de learning.
- Kies formats bij voorkeur uit: Video UGC, Static, Motion graphic, Carousel. Structuren uit: GRWM, Probleem-oplossing, POV, Testimonial, Dag-in-het-leven, Benefit bullets. Creator kort (Micro-influencer, Klant/UGC, Merk zelf).
- Taal: Nederlands. Baseer je op de aangeleverde data — geen aannames.`;

/** Stelt de volgende testronde samen: varianten van de volgende testvariabele, o.b.v. de winnaar + learning. */
export async function genereerVolgendeTestronde(input: {
	winnaar: ConceptContext;
	volgendeVariabele: string;
	metrics: { hook_rate?: number | null; hold_rate?: number | null; ctr?: number | null; roas?: number | null; cpa?: number | null };
	observatie: string | null;
	analyse: { wat_werkte?: string; volgende_stap?: string } | null;
}) {
	const context = [
		`## Winnend concept (de basis — alles behalve "${input.volgendeVariabele}" blijft gelijk)`,
		conceptTekst(input.winnaar),
		'',
		`## Volgende te testen variabele\n${input.volgendeVariabele}`,
		'',
		'## Resultaten winnaar',
		`Hook rate: ${input.metrics.hook_rate ?? '—'}% · Hold rate: ${input.metrics.hold_rate ?? '—'}% · CTR: ${input.metrics.ctr ?? '—'}% · ROAS: ${input.metrics.roas ?? '—'}x · CPA: €${input.metrics.cpa ?? '—'}`,
		input.observatie?.trim() ? `Observatie: ${input.observatie.trim()}` : '',
		input.analyse?.wat_werkte ? `## Learning — wat werkte\n${input.analyse.wat_werkte}` : '',
		input.analyse?.volgende_stap ? `## Learning — geadviseerde volgende stap\n${input.analyse.volgende_stap}` : ''
	]
		.filter(Boolean)
		.join('\n');

	// effort 'medium': genereert concepten met onderbouwing; medium houdt de duur onder de Vercel-timeout.
	return claudeJSON<{ concepten: VervolgConcept[] }>(VERVOLG_SYSTEM, context, VERVOLG_SCHEMA, 16000, 'medium');
}
