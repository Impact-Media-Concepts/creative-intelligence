import type Anthropic from '@anthropic-ai/sdk';
import { anthropic, CLAUDE_MODEL } from './claude';
import type { TriggerMapData } from '$lib/trigger-map';
import { BRON1_VRAGEN, BRON2_VRAGEN } from '$lib/intake-vragen';
import { heeftInhoud } from '$lib/progress';

const SYSTEM_PROMPT = `Je bent een Creative Social Ads Strateeg. Op basis van de aangeleverde intake data genereer je een trigger map voor een Social Ads contentstrategie.
Analyseer alle beschikbare bronnen (klantgesprek, klantenservice interviews, concurrentieonderzoek, reviews, eigen data) en genereer een gestructureerde trigger map.

Geef output ALLEEN als valide JSON in dit exacte formaat:
{
  "pijnpunten": ["item1", "item2"],
  "wensen": ["item1", "item2"],
  "bezwaren": ["item1", "item2"],
  "taal_doelgroep": ["letterlijke zin1", "zin2"],
  "routines": ["item1", "item2"],
  "kansen_vs_concurrenten": ["item1", "item2"],
  "personas": [
    { "naam": "korte naam van het segment", "omschrijving": "wie is dit, 1-2 zinnen", "kernbehoefte": "wat wil dit segment vooral", "kernbezwaar": "grootste twijfel/drempel" }
  ],
  "invalshoeken": [
    { "naam": "naam van invalshoek", "omschrijving": "2-3 zinnen", "funnelfase": "TOFU/MOFU/BOFU", "onderbouwing": "waarom kansrijk op basis van de data" }
  ]
}

Richtlijnen:
- Pijnpunten: 4-6 items
- Wensen: 4-6 items
- Bezwaren: 3-5 items
- Taal doelgroep: 8-12 letterlijke woorden/zinnen uit de bronnen
- Routines: 3-5 items
- Kansen vs concurrenten: 3-5 concrete gaps die je ziet
- Persona's: 2-4 duidelijk onderscheidende doelgroep-segmenten uit de data (bijv. verschillende koopmotieven of levensfases). Geen verzonnen segmenten.
- Invalshoeken: exact 3 per funnelfase (3× TOFU, 3× MOFU, 3× BOFU = 9 in totaal). Binnen elke fase gesorteerd op kans. Elke invalshoek is een concrete, testbare hoek — geen herhaling van dezelfde hoek in meerdere fases.
- FUNNEL-PLAATSING (belangrijk — plaats elke invalshoek in de JUISTE fase):
    • TOFU (awareness): brede herkenning, pijnpunt/emotie, nieuwsgierigheid, het probleem of verlangen zelf. Nog GEEN merk-USP's, bewijs of aanbod.
    • MOFU (overweging): USP's, uitleg, vergelijking met alternatieven/concurrenten, SOCIAL PROOF (reviews/beoordelingen/cijfers), twijfels wegnemen.
    • BOFU (conversie): aanbod, prijs/financiering, garantie, urgentie, de laatste drempel wegnemen, directe call-to-action.
  Let op: social proof, reviews, ratings en vergelijkingen horen in MOFU of BOFU — NOOIT in TOFU.
- Taal: Nederlands
- Gebruik alleen wat uit de data blijkt — geen aannames`;

/** JSON-schema voor structured outputs (garandeert valide JSON). */
const TRIGGER_MAP_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		pijnpunten: { type: 'array', items: { type: 'string' } },
		wensen: { type: 'array', items: { type: 'string' } },
		bezwaren: { type: 'array', items: { type: 'string' } },
		taal_doelgroep: { type: 'array', items: { type: 'string' } },
		routines: { type: 'array', items: { type: 'string' } },
		kansen_vs_concurrenten: { type: 'array', items: { type: 'string' } },
		personas: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					naam: { type: 'string' },
					omschrijving: { type: 'string' },
					kernbehoefte: { type: 'string' },
					kernbezwaar: { type: 'string' }
				},
				required: ['naam', 'omschrijving', 'kernbehoefte', 'kernbezwaar']
			}
		},
		invalshoeken: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					naam: { type: 'string' },
					omschrijving: { type: 'string' },
					funnelfase: { type: 'string', enum: ['TOFU', 'MOFU', 'BOFU'] },
					onderbouwing: { type: 'string' }
				},
				required: ['naam', 'omschrijving', 'funnelfase', 'onderbouwing']
			}
		}
	},
	required: [
		'pijnpunten',
		'wensen',
		'bezwaren',
		'taal_doelgroep',
		'routines',
		'kansen_vs_concurrenten',
		'personas',
		'invalshoeken'
	]
};

export interface IntakeData {
	bron1: Array<{ vraag_nummer: number; antwoord: string | null }>;
	bron2: Array<{ vraag_nummer: number; antwoord: string | null }>;
	bron3: Array<Record<string, string | null>>;
	bron4: Array<{ platform: string | null; bron_naam: string | null; ruwe_tekst: string | null }>;
	bron5: {
		beste_advertenties: string | null;
		best_verkopende_producten: string | null;
		search_console: string | null;
		organische_posts: string | null;
	} | null;
	bron6: Array<{ titel: string | null; inhoud: string | null }>;
}

/** Bouwt een leesbaar Nederlands promptblok uit alle beschikbare intake-data. */
export function bouwIntakeTekst(data: IntakeData): string {
	const delen: string[] = [];

	// Bron 1
	const b1 = new Map(data.bron1.map((r) => [r.vraag_nummer, r.antwoord]));
	const b1regels = BRON1_VRAGEN.filter((v) => heeftInhoud(b1.get(v.nummer))).map(
		(v) => `${v.nummer}. ${v.tekst}\n   ${b1.get(v.nummer)}`
	);
	if (b1regels.length) delen.push('## BRON 1 — Klantgesprek\n' + b1regels.join('\n'));

	// Bron 2
	const nvt = data.bron2.some((r) => r.vraag_nummer === 0 && heeftInhoud(r.antwoord));
	const b2 = new Map(data.bron2.map((r) => [r.vraag_nummer, r.antwoord]));
	if (nvt) {
		delen.push('## BRON 2 — Interne interviews\n(Gemarkeerd als niet beschikbaar.)');
	} else {
		const b2regels = BRON2_VRAGEN.filter((v) => heeftInhoud(b2.get(v.nummer))).map(
			(v) => `${v.nummer}. ${v.tekst}\n   ${b2.get(v.nummer)}`
		);
		if (b2regels.length) delen.push('## BRON 2 — Interne interviews\n' + b2regels.join('\n'));
	}

	// Bron 3
	const b3regels = data.bron3
		.map((c, i) => {
			const velden = [
				['Naam', c.naam],
				['URL', c.url],
				['Lang draaiende ad formats (Meta Ad Library)', c.meta_ad_library],
				['Invalshoeken / beloften', c.invalshoeken],
				['Opvallende taal website', c.website_taal],
				['TikTok Creative Center', c.tiktok_observaties],
				['Kansen (wat doen zij NIET)', c.kansen]
			].filter(([, v]) => heeftInhoud(v as string));
			if (!velden.length) return '';
			return (
				`Concurrent ${i + 1}\n` + velden.map(([l, v]) => `   - ${l}: ${v}`).join('\n')
			);
		})
		.filter(Boolean);
	if (b3regels.length) delen.push('## BRON 3 — Concurrentieonderzoek\n' + b3regels.join('\n'));

	// Bron 4
	const b4regels = data.bron4
		.filter((r) => heeftInhoud(r.ruwe_tekst))
		.map(
			(r) =>
				`[${r.platform || 'Onbekend platform'}${r.bron_naam ? ' — ' + r.bron_naam : ''}]\n${r.ruwe_tekst}`
		);
	if (b4regels.length) delen.push('## BRON 4 — Reviews & social listening\n' + b4regels.join('\n\n'));

	// Bron 5
	if (data.bron5) {
		const b5 = [
			['Best presterende advertenties', data.bron5.beste_advertenties],
			['Best verkopende producten/categorieën', data.bron5.best_verkopende_producten],
			['Google Search Console inzichten', data.bron5.search_console],
			['Organische posts met hoogste engagement', data.bron5.organische_posts]
		].filter(([, v]) => heeftInhoud(v as string));
		if (b5.length)
			delen.push('## BRON 5 — Eigen data klant\n' + b5.map(([l, v]) => `- ${l}: ${v}`).join('\n'));
	}

	// Bron 6 — Overig
	const b6regels = data.bron6
		.filter((r) => heeftInhoud(r.inhoud))
		.map((r) => `[${r.titel || 'Overig'}]\n${r.inhoud}`);
	if (b6regels.length) delen.push('## BRON 6 — Overige data\n' + b6regels.join('\n\n'));

	return delen.join('\n\n');
}

export interface GeneratieResultaat {
	data: TriggerMapData;
	model: string;
	prompt: string;
	response: string;
	tokensInput: number;
	tokensOutput: number;
	duurMs: number;
}

/** Roept Claude aan en geeft de trigger map + metadata voor logging terug. */
export async function genereerTriggerMap(intakeTekst: string): Promise<GeneratieResultaat> {
	const prompt = `Hieronder de beschikbare intake-data. Genereer op basis hiervan de trigger map.\n\n${intakeTekst}`;
	const start = Date.now();

	const response = await anthropic.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: 16000,
		// Adaptive thinking: model denkt zelf na over de diepte (denk-tokens tellen mee in max_tokens).
		thinking: { type: 'adaptive' },
		system: SYSTEM_PROMPT,
		messages: [{ role: 'user', content: prompt }],
		// Structured outputs: garandeert valide JSON volgens het schema.
		// 'medium' i.p.v. 'high': trigger map is de zwaarste generatie (meeste output) —
		// bij 'high' liep 'ie tegen de ~67s aan, óver de Vercel-timeout van 60s.
		output_config: { effort: 'medium', format: { type: 'json_schema', schema: TRIGGER_MAP_SCHEMA } }
	} as Anthropic.Messages.MessageCreateParamsNonStreaming);

	const duurMs = Date.now() - start;
	const tekst = response.content
		.filter((b): b is Anthropic.TextBlock => b.type === 'text')
		.map((b) => b.text)
		.join('');

	let data: TriggerMapData;
	try {
		data = JSON.parse(tekst) as TriggerMapData;
	} catch {
		throw new Error('Claude gaf geen valide JSON terug.');
	}

	return {
		data,
		model: response.model,
		prompt,
		response: tekst,
		tokensInput: response.usage.input_tokens,
		tokensOutput: response.usage.output_tokens,
		duurMs
	};
}
