import type Anthropic from '@anthropic-ai/sdk';
import { claudeJSON } from './claude';
import { BRON1_VRAGEN, BRON2_VRAGEN, type Vraag } from '$lib/intake-vragen';

/** Eén door Claude uit het document gehaald antwoord op een genummerde intake-vraag (Bron 1/2). */
export interface GeparseerdAntwoord {
	vraag_nummer: number;
	antwoord: string;
}

/** Een uit het document afgeleide concurrent (Bron 3). */
export interface GeparseerdeConcurrent {
	naam: string;
	url: string;
	meta_ad_library: string;
	invalshoeken: string;
	website_taal: string;
	tiktok_observaties: string;
	kansen: string;
}

/** Een uit het document afgeleide reviewbron (Bron 4). */
export interface GeparseerdeReview {
	platform: string;
	bron_naam: string;
	samenvatting: string;
}

export interface IntakeParseResultaat {
	bron1: GeparseerdAntwoord[];
	bron2: GeparseerdAntwoord[];
	bron3: GeparseerdeConcurrent[];
	bron4: GeparseerdeReview[];
}

const ANTWOORD_ITEMS = {
	type: 'array',
	items: {
		type: 'object',
		additionalProperties: false,
		properties: {
			vraag_nummer: { type: 'integer' },
			antwoord: { type: 'string' }
		},
		required: ['vraag_nummer', 'antwoord']
	}
};

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		bron1: ANTWOORD_ITEMS,
		bron2: ANTWOORD_ITEMS,
		bron3: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					naam: { type: 'string' },
					url: { type: 'string' },
					meta_ad_library: { type: 'string' },
					invalshoeken: { type: 'string' },
					website_taal: { type: 'string' },
					tiktok_observaties: { type: 'string' },
					kansen: { type: 'string' }
				},
				required: [
					'naam',
					'url',
					'meta_ad_library',
					'invalshoeken',
					'website_taal',
					'tiktok_observaties',
					'kansen'
				]
			}
		},
		bron4: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					platform: { type: 'string' },
					bron_naam: { type: 'string' },
					samenvatting: { type: 'string' }
				},
				required: ['platform', 'bron_naam', 'samenvatting']
			}
		}
	},
	required: ['bron1', 'bron2', 'bron3', 'bron4']
};

/** Bouwt een genummerde vragenlijst voor in de prompt. */
function vragenlijst(vragen: Vraag[]): string {
	return vragen
		.map((v) => `${v.nummer}. [${v.categorie ?? 'Overig'}] ${v.tekst}`)
		.join('\n');
}

const SYSTEM = `Je bent een intake-assistent bij Social Ads agency Online Klik. Je krijgt een document en moet de inhoud naar de JUISTE intake-bron routeren. Er zijn vier bronnen:

- Bron 1 = Klantgesprek: antwoorden op genummerde vragen over de EINDKLANT (doelgroep, koopmotivatie, problemen, twijfels, taal van de klant).
- Bron 2 = Interne interviews: signalen van klantenservice/sales (vragen van klanten, afhaakredenen, misverstanden).
- Bron 3 = Concurrentie: informatie OVER concurrenten (advertenties/Meta Ad Library, invalshoeken/beloften, website-taal, TikTok, kansen die zij laten liggen).
- Bron 4 = Reviews: beoordelingen/reviews (van eigen klanten óf van concurrenten), samengevat in positief/negatief/gaps.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "bron1": [ { "vraag_nummer": 1, "antwoord": "..." } ],
  "bron2": [ { "vraag_nummer": 1, "antwoord": "..." } ],
  "bron3": [ { "naam": "concurrent", "url": "", "meta_ad_library": "", "invalshoeken": "", "website_taal": "", "tiktok_observaties": "", "kansen": "" } ],
  "bron4": [ { "platform": "Trustpilot/Kiyoh/Google/...", "bron_naam": "", "samenvatting": "Positief: ...\\nNegatief: ...\\nGaps/kansen: ..." } ]
}

ROUTEER ZO:
- REVIEWS/beoordelingen → "bron4" (per platform/bron een samenvatting met kopjes "Positief:", "Negatief:", "Gaps/kansen:"). NIET in bron1/bron2.
- CONCURRENTEN → "bron3" (één item per concurrent). Verdeel de info over de JUISTE velden:
    • "meta_ad_library": ALLES over hun advertenties — lang draaiende/langst lopende formats + looptijd (dagen/sinds wanneer), funnelverdeling (TOFU/MOFU/BOFU met aantallen), video vs. static ratio, aantal actieve ads, opvallende formats. Laat dit veld NOOIT leeg als het document ad-data bevat.
    • "invalshoeken": welke boodschappen/beloften/USP's/emotionele hoeken zij gebruiken.
    • "website_taal": letterlijke slogans, koppen en claims (tussen aanhalingstekens citeren).
    • "tiktok_observaties": TikTok Creative Center-observaties, indien aanwezig.
    • "kansen": wat doen zij NIET of zwak — concrete kansen voor ons om ons te onderscheiden.
- EINDKLANT (interview/gesprek) → genummerde vragen van Bron 1, of Bron 2 bij klantenservice/sales-signalen.

DIEPGANG (belangrijk — voorkom te dunne velden):
- Als er een DOCUMENT of AFBEELDING is bijgevoegd (PDF/afbeelding): lees ook TABELLEN, GRAFIEKEN en tekst-in-afbeeldingen. Neem concrete cijfers, aantallen en percentages uit grafieken/tabellen letterlijk over (bijv. "Via Google: 48", "Ja 48% / Nee 52%").
- Wees UITPUTTEND: neem ELK relevant punt uit het document mee. Vat NIET samen tot één regel.
- Schrijf elk Bron 3-veld en elk kopje in Bron 4 als een LIJST met bullets — elke bullet op een NIEUWE regel beginnend met "- ". Streef naar meerdere bullets per veld waar het document dat toelaat.
- KWANTIFICEER waar mogelijk: aantallen, percentages, looptijden, data/periodes, namen.

Strikte regels:
- Neem alleen op wat het document ECHT bevat. Verzin NIETS en vul niet aan met aannames. Twijfel je over een feit? Weglaten — maar laat een veld niet leeg als het document er wél info over bevat.
- Voor Bron 1/2: gebruik het juiste "vraag_nummer" uit de lijsten hieronder; verzin geen nummers.
- Voor Bron 3: "naam" is verplicht. Laat een veld alleen op "" als het document er niets over zegt.
- Voor Bron 4: citeer waar mogelijk de letterlijke woorden van klanten. "platform"/"bron_naam" op "" als onbekend.
- Als een bron niet in het document voorkomt, geef een lege array voor die bron.
- Taal: Nederlands, in de woorden van de klant/concurrent waar dat kan.`;

/**
 * Laat Claude een vrij document routeren naar de vier intake-bronnen (Bron 1-4).
 * Schrijft niets weg — geeft een voorstel terug dat de gebruiker eerst beoordeelt.
 */
export async function parseIntakeDocument(documentTekst: string) {
	const prompt = `## Vragenlijst Bron 1 (klantgesprek)\n${vragenlijst(BRON1_VRAGEN)}\n\n## Vragenlijst Bron 2 (interne interviews)\n${vragenlijst(BRON2_VRAGEN)}\n\n## Document\n${documentTekst}`;

	// effort 'medium': grondiger/uitputtender extractie (de gebruiker wil rijke velden,
	// geen dunne samenvatting). Ruime max_tokens zodat de (soms lange) JSON niet afknapt.
	return claudeJSON<IntakeParseResultaat>(SYSTEM, prompt, SCHEMA, 16000, 'medium');
}

/**
 * Laat Claude een bijgevoegd bestand (PDF of afbeelding) VISUEEL lezen — inclusief tabellen,
 * grafieken en tekst-in-afbeeldingen — en routeren naar de vier intake-bronnen.
 */
export async function parseIntakeBestand(base64: string, mediaType: string) {
	const instructie = `## Vragenlijst Bron 1 (klantgesprek)\n${vragenlijst(BRON1_VRAGEN)}\n\n## Vragenlijst Bron 2 (interne interviews)\n${vragenlijst(BRON2_VRAGEN)}\n\n## Opdracht\nHierboven zit een bijgevoegd bestand (PDF of afbeelding), mogelijk met tabellen, grafieken en afbeeldingen. Lees ALLE inhoud — ook cijfers uit grafieken/tabellen en tekst in afbeeldingen — en routeer volgens de regels.`;

	const bestandBlok = (
		mediaType === 'application/pdf'
			? {
					type: 'document',
					source: { type: 'base64', media_type: 'application/pdf', data: base64 }
				}
			: {
					type: 'image',
					source: { type: 'base64', media_type: mediaType, data: base64 }
				}
	) as unknown as Anthropic.Messages.ContentBlockParam;

	// effort 'low': vision-verwerking kost al tijd; 'low' houdt het onder de Vercel-timeout.
	return claudeJSON<IntakeParseResultaat>(
		SYSTEM,
		[bestandBlok, { type: 'text', text: instructie }],
		SCHEMA,
		16000,
		'low'
	);
}
