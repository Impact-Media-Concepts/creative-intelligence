import { claudeJSON } from './claude';
import { BEWUSTZIJN_LABELS, funnelUitBewustzijn, type TriggerMapData } from '$lib/trigger-map';
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
    { "naam": "naam van invalshoek", "omschrijving": "2-3 zinnen", "bewustzijn": "Onbewust/Probleembewust/Oplossingsbewust/Productbewust/Meest bewust", "onderbouwing": "waarom kansrijk op basis van de data" }
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
- Invalshoeken: 8-12 in totaal, verdeeld over de vijf bewustzijnsfases (zie hieronder). Probleembewust, Oplossingsbewust en Productbewust: 2-3 per fase. Onbewust en Meest bewust: 1-2 per fase, en alleen als de data daar echt aanleiding toe geeft (Meest bewust bv. alleen bij een concreet aanbod, prijs of deadline). ALLEEN écht onderscheidende, kansrijke hoeken: liever 2 sterke dan 3 waarvan er één zwak is of eigenlijk een tactiek. Binnen elke fase gesorteerd op kans. Hetzelfde pijnpunt/verlangen mag in meerdere fases terugkomen, maar dan als een écht andere boodschap (andere ingang voor iemand die iets anders weet) — nooit dezelfde boodschap herhaald.
- KWALITEIT VAN EEN INVALSHOEK (belangrijk): een invalshoek is de BOODSCHAP / het inzicht dat de doelgroep raakt — NIET het advertentie-mechanisme, format of de CTA. NOOIT als invalshoek opvoeren: ad-tactieken/mechanieken (retargeting, dynamische/DCA-ads, catalogus-ads, "urgentie", "voorraad-urgentie", "garantie-CTA"), een format (carousel/UGC/video/"contentserie") of een losse call-to-action. Ook een Productbewust- of Meest-bewust-hoek is een concreet inzicht/boodschap (bv. een specifiek bezwaar omgedraaid), geen tactiek. Maak hoeken specifiek en scroll-stoppend, geworteld in een concreet pijnpunt/wens/bezwaar en waar mogelijk in de LETTERLIJKE taal van de doelgroep — vermijd brave, generieke categorielabels.
- BEWUSTZIJNSFASE (belangrijk — plaats elke invalshoek in de JUISTE fase; de fase beschrijft wat de persoon al WEET, en bepaalt wat de creative moet doen):
    • Onbewust — taak: vertel een verhaal. Ze weten nog niet dat ze een probleem hebben. Een herkenbare situatie of nieuwsgierig makend inzicht. GEEN product, USP's, bewijs of aanbod.
    • Probleembewust — taak: benoem de pijn. Ze voelen het probleem maar kennen de oplossing niet. Het pijnpunt of verlangen scherp, in hun eigen taal. Nog GEEN merk-USP's, bewijs of aanbod.
    • Oplossingsbewust — taak: jouw aanpak versus de rest. Ze zoeken een oplossing en vergelijken. USP's, uitleg, vergelijking met alternatieven/concurrenten.
    • Productbewust — taak: bewijs en bezwaren. Ze kennen het merk/product maar twijfelen nog. SOCIAL PROOF (reviews/beoordelingen/cijfers), garanties, het kernbezwaar omdraaien.
    • Meest bewust — taak: prijs en deadline. Ze willen eigenlijk al kopen. Aanbod, prijs/financiering, actie, deadline of urgentie (alleen als dat in de data staat).
  Let op: social proof, reviews, ratings en vergelijkingen horen NOOIT in Onbewust of Probleembewust.
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
					bewustzijn: { type: 'string', enum: BEWUSTZIJN_LABELS },
					onderbouwing: { type: 'string' }
				},
				required: ['naam', 'omschrijving', 'bewustzijn', 'onderbouwing']
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

/** Roept het model (via de proxy) aan en geeft de trigger map + metadata voor logging terug. */
export async function genereerTriggerMap(intakeTekst: string): Promise<GeneratieResultaat> {
	const prompt = `Hieronder de beschikbare intake-data. Genereer op basis hiervan de trigger map.\n\n${intakeTekst}`;
	const res = await claudeJSON<TriggerMapData>(SYSTEM_PROMPT, prompt, TRIGGER_MAP_SCHEMA, 16000, 'medium');
	// De AI kiest de bewustzijnsfase; de legacy-funnelfase (TOFU/MOFU/BOFU) wordt eruit afgeleid
	// zodat kolommen en code die er nog op leunen (meta-sync, guardrail) blijven werken.
	res.data.invalshoeken = res.data.invalshoeken.map((i) => ({
		...i,
		funnelfase: funnelUitBewustzijn(i.bewustzijn)
	}));
	return res;
}
