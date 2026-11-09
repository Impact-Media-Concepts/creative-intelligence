import { claudeJSON } from './claude';
import { BEWUSTZIJN_FASEN, normaliseerBewustzijn, type Bewustzijn } from '$lib/trigger-map';

/** Eén verlangen (rij van het raster): een pijnpunt, wens of bezwaar uit de trigger map. */
export interface RasterRij {
	type: 'Pijnpunt' | 'Wens' | 'Bezwaar';
	tekst: string;
}

export interface RasterContext {
	rijen: RasterRij[];
	fases: Bewustzijn[];
	personas?: Array<{ naam?: string; omschrijving?: string; kernbehoefte?: string; kernbezwaar?: string }>;
	taal_doelgroep?: string[];
	kansen_vs_concurrenten?: string[];
	/** Namen van invalshoeken die al bestaan — niet opnieuw voorstellen. */
	bestaand?: string[];
}

export interface RasterCel {
	/** 0-gebaseerde index in `rijen`. */
	rij: number;
	fase: Bewustzijn;
	naam: string;
	omschrijving: string;
	onderbouwing: string;
}

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		cellen: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				properties: {
					rij: { type: 'integer' },
					fase: { type: 'string' },
					naam: { type: 'string' },
					omschrijving: { type: 'string' },
					onderbouwing: { type: 'string' }
				},
				required: ['rij', 'fase', 'naam', 'omschrijving', 'onderbouwing']
			}
		}
	},
	required: ['cellen']
};

const FASE_UITLEG = BEWUSTZIJN_FASEN.map((f) => `    • ${f.label} — taak: ${f.taak}. ${f.uitleg}`).join('\n');

const SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Je vult een ANGLE-RASTER: per verlangen van de doelgroep (rij) en per bewustzijnsfase (kolom) bedenk je één invalshoek — dezelfde pijn of wens, maar telkens met een andere ingang voor iemand die iets anders WEET.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "cellen": [
    { "rij": 1, "fase": "Probleembewust", "naam": "korte scroll-stoppende invalshoek", "omschrijving": "2 zinnen: wat laat de creative zien/zeggen", "onderbouwing": "waarom dit werkt, gekoppeld aan het verlangen en de data" }
  ]
}

De bewustzijnsfases en hun taak:
${FASE_UITLEG}

Regels:
- "rij" is het nummer van het verlangen zoals aangeleverd (beginnend bij 1). "fase" is EXACT één van de aangeleverde fases.
- Maximaal één invalshoek per combinatie van verlangen en fase. Sla een combinatie ALLEEN over als je geen sterke, onderscheidende hoek ziet — liever een leeg vak dan een zwakke of geforceerde hoek.
- Zelfde verlangen in verschillende fases = een ÉCHT andere boodschap (andere ingang), nooit dezelfde boodschap in andere woorden.
- Een invalshoek is de BOODSCHAP / het inzicht dat de doelgroep raakt — NIET een ad-tactiek, format of CTA (geen retargeting, carousel, UGC, "urgentie", "garantie-CTA"). Maak 'm specifiek en scroll-stoppend, en gebruik waar mogelijk de LETTERLIJKE taal van de doelgroep.
- Houd je aan de taak van de fase: Onbewust en Probleembewust hebben GEEN product, USP's, bewijs of aanbod; social proof, reviews en vergelijkingen horen in Oplossings- of Productbewust; Meest bewust alleen als er in de data een concreet aanbod, prijs of deadline is.
- VERZIN NOOIT FEITEN. Gebruik geen cijfers, aantallen, testresultaten, certificeringen of productclaims die niet letterlijk in de aangeleverde data staan (dus bv. geen "na 50 wasbeurten", "getest", "90% minder retouren"). Bewijs in Productbewust (en Oplossingsbewust) mag ALLEEN bestaan uit wat in de data staat: reviews, garanties, USP's, klantuitspraken, kansen t.o.v. concurrenten. Ontbreekt dat voor een verlangen, laat het vak dan leeg in plaats van bewijs te verzinnen. Beschrijf liever WAT er laten zien wordt dan een onbewezen belofte.
- Stel GEEN invalshoeken voor die inhoudelijk al bestaan (zie "Bestaande invalshoeken").
- "naam": maximaal ±70 tekens. "omschrijving" en "onderbouwing": elk 1-2 zinnen.
- Taal: Nederlands. Baseer je uitsluitend op de aangeleverde data — geen aannames verzinnen.`;

/** Laat Claude per verlangen × bewustzijnsfase een invalshoek voorstellen. */
export async function genereerAngleRaster(ctx: RasterContext) {
	const context = [
		'## Verlangens (rijen)',
		ctx.rijen.map((r, i) => `${i + 1}. [${r.type}] ${r.tekst}`).join('\n'),
		'## Bewustzijnsfases (kolommen)',
		ctx.fases.join(', '),
		ctx.bestaand?.length
			? '## Bestaande invalshoeken (niet opnieuw voorstellen)\n' + ctx.bestaand.map((n) => `- ${n}`).join('\n')
			: '',
		ctx.personas?.length
			? "## Persona's\n" +
				ctx.personas
					.map(
						(p) =>
							`- ${p.naam ?? ''}: ${p.omschrijving ?? ''} (behoefte: ${p.kernbehoefte ?? '?'}; bezwaar: ${p.kernbezwaar ?? '?'})`
					)
					.join('\n')
			: '',
		ctx.taal_doelgroep?.length ? `## Taal van de doelgroep (gebruik letterlijk waar passend)\n${ctx.taal_doelgroep.join('; ')}` : '',
		ctx.kansen_vs_concurrenten?.length ? `## Kansen t.o.v. concurrenten\n${ctx.kansen_vs_concurrenten.join('; ')}` : ''
	]
		.filter(Boolean)
		.join('\n\n');

	const res = await claudeJSON<{ cellen?: Array<Record<string, unknown>> }>(
		SYSTEM,
		context,
		SCHEMA,
		16000,
		'medium'
	);

	// De proxy dwingt het schema niet af → alles valideren en normaliseren; ongeldige cellen vallen weg.
	const toegestaan = new Set<Bewustzijn>(ctx.fases);
	const gezien = new Set<string>();
	const cellen: RasterCel[] = [];
	for (const c of res.data.cellen ?? []) {
		const rij = Number(c.rij) - 1;
		const fase = normaliseerBewustzijn(c.fase);
		const naam = String(c.naam ?? '').trim();
		if (!Number.isInteger(rij) || rij < 0 || rij >= ctx.rijen.length) continue;
		if (!fase || !toegestaan.has(fase) || !naam) continue;
		const sleutel = `${rij}:${fase}`;
		if (gezien.has(sleutel)) continue; // maximaal één per vak
		gezien.add(sleutel);
		cellen.push({
			rij,
			fase,
			naam: naam.slice(0, 120),
			omschrijving: String(c.omschrijving ?? '').trim().slice(0, 400),
			onderbouwing: String(c.onderbouwing ?? '').trim().slice(0, 400)
		});
	}
	return { ...res, cellen };
}
