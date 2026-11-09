import { claudeJSON } from './claude';
import type { Funnelfase, Prioriteit } from '$lib/supabase/database.types';
import { BEWUSTZIJN_LABELS, funnelUitBewustzijn, normaliseerBewustzijn } from '$lib/trigger-map';

export interface VoorgesteldConcept {
	/** Afgeleid uit `awareness` (legacy-kolom); de AI kiest alleen de bewustzijnsfase. */
	funnelfase: Funnelfase;
	invalshoek: string;
	aanbod?: string;
	format: string;
	structuur: string;
	creator_type: string;
	hook?: string;
	cta?: string;
	awareness?: string;
	hypothese: string;
	variabele: string;
	prioriteit: Prioriteit;
	onderbouwing: string;
}

interface TriggerMapContext {
	pijnpunten?: string[];
	wensen?: string[];
	bezwaren?: string[];
	taal_doelgroep?: string[];
	kansen_vs_concurrenten?: string[];
	personas?: Array<{
		naam?: string;
		omschrijving?: string;
		kernbehoefte?: string;
		kernbezwaar?: string;
	}>;
	invalshoeken?: Array<{
		naam?: string;
		omschrijving?: string;
		onderbouwing?: string;
		bewustzijn?: string;
		status?: string;
		gearchiveerd?: boolean;
		/** Prioriteit uit de (door de strateeg goedgekeurde) scorekaart; leidend als aanwezig. */
		prioriteit?: string;
	}>;
}

/** Terugkoppeling uit eerdere testrondes — maakt de Creative Loop zelfversterkend. */
interface LearningsContext {
	winnaars?: Array<{
		invalshoek?: string | null;
		bewustzijn?: string | null;
		format?: string | null;
		structuur?: string | null;
		creator_type?: string | null;
		wat_werkte?: string | null;
		volgende_stap?: string | null;
		observatie?: string | null;
	}>;
	/** Namen van invalshoeken die getest zijn en wérken (bouw hierop voort). */
	werkt?: string[];
	/** Namen van invalshoeken die getest zijn en NIET werken (niet opnieuw voorstellen). */
	werktNiet?: string[];
}

/** Sturing van de strateeg: scope + beschikbare middelen (uit de teststrategie-configuratie). */
interface MatrixConfig {
	/** Namen van de persona's waarop de test zich richt (leeg = alle). */
	personas?: string[];
	/** Bewustzijnsfases die meegenomen worden (leeg = alle). */
	bewustzijnsfases?: string[];
	/** Beschikbare contentvormen/formats (leeg = geen beperking). */
	middelen?: string[];
	/** Doelstelling/KPI-focus (bv. awareness of direct rendement). */
	doelstelling?: string;
	/** Concreet target (bv. "streef-ROAS 3"). */
	target?: string;
}

const SCHEMA = {
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
					aanbod: { type: 'string' },
					format: { type: 'string' },
					structuur: { type: 'string' },
					creator_type: { type: 'string' },
					hook: { type: 'string' },
					cta: { type: 'string' },
					awareness: { type: 'string', enum: BEWUSTZIJN_LABELS },
					hypothese: { type: 'string' },
					variabele: { type: 'string' },
					prioriteit: { type: 'string', enum: ['Hoog', 'Middel', 'Laag'] },
					onderbouwing: { type: 'string' }
				},
				required: [
					'awareness',
					'invalshoek',
					'format',
					'structuur',
					'creator_type',
					'hypothese',
					'variabele',
					'prioriteit',
					'onderbouwing'
				]
			}
		}
	},
	required: ['concepten']
};

const SYSTEM = `Je bent een Creative Social Ads Strateeg bij Online Klik. Op basis van de trigger map stel je een variabelenmatrix (testopzet) voor: een set advertentieconcepten om te gaan testen.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "concepten": [
    { "awareness": "Onbewust/Probleembewust/Oplossingsbewust/Productbewust/Meest bewust", "aanbod": "...", "invalshoek": "...", "format": "...", "structuur": "...", "creator_type": "...", "hook": "...", "cta": "...", "hypothese": "...", "variabele": "...", "prioriteit": "Hoog/Middel/Laag", "onderbouwing": "..." }
  ]
}

Richtlijnen:
- Maak één concept per invalshoek uit de trigger map (dek alle aanwezige bewustzijnsfases af); 6 tot 10 concepten. Zijn er meer invalshoeken, kies dan de kansrijkste (op prioriteit) en zorg dat elke bewustzijnsfase die in de trigger map voorkomt vertegenwoordigd blijft.
- Testvolgorde is Invalshoek → Format → Structuur → Creator. In deze eerste opzet test je de INVALSHOEK, dus zet "variabele" bij ELK concept op "Invalshoek".
- CRUCIAAL — schoon testen: omdat je nu de invalshoek test, moeten de andere variabelen GELIJK blijven zodat het verschil alleen door de invalshoek komt. Kies daarom PER BEWUSTZIJNSFASE één vast "format", één vaste "structuur" en één vast "creator_type", en gebruik die identiek voor alle concepten binnen die fase. Alleen "invalshoek" (en de bijbehorende "hypothese") verschilt binnen een fase. Verschillende fases mogen wél een ander format/structuur/creator hebben.
- Kies "format" bij voorkeur uit: Video UGC, Static, Motion graphic, Carousel.
- Kies "structuur" bij voorkeur uit: GRWM, Probleem-oplossing, POV, Testimonial, Dag-in-het-leven, Benefit bullets.
- "aanbod": het concrete product of de dienst die in dit concept centraal staat (bijv. "Longsleeve", "Belastingaangifte"). Leid dit af uit de intake/aanbod van de klant — verzin geen aanbod dat de klant niet heeft. Kort.
- "awareness": de bewustzijnsfase van de doelgroep die bij deze invalshoek past (Onbewust / Probleembewust / Oplossingsbewust / Productbewust / Meest bewust). Neem de fase over die bij de invalshoek in de trigger map staat (tussen haakjes), tenzij die duidelijk fout is (zie BEWUSTZIJNS-PLAATSING).
- "hook": één concrete eerste-3-seconden-hook (visueel, auditief of tekstueel) die past bij de invalshoek — dat waarmee de kijker blijft kijken. Kort en specifiek.
- "cta": passende call-to-action, kort (bijv. "Shop nu", "Meer informatie", "Boek een gesprek"). Houd 'm consistent per bewustzijnsfase/doel en laat 'm meegroeien met de fase: zacht en laagdrempelig bij Onbewust/Probleembewust (bijv. "Meer informatie"), concreet bij Oplossings-/Productbewust, direct bij Meest bewust (bijv. "Shop nu").
- "creator_type": kort, en MOET passen bij het gekozen format en de beschikbare middelen. Video/authentieke content → bijv. "Micro-influencer" of "Klant/UGC". STATIC content is GEEN UGC: bij static beeld gebruik je termen als "Klantvisual", "Merk-eigen visual" of "Designer" — NOOIT "UGC" of "Klant/UGC" (dat impliceert video). Als onder "Sturing" alleen static-achtige middelen staan, kies dan uitsluitend static-passende creator-types.
- "hypothese": concreet en toetsbaar (Wij verwachten dat ... omdat ...).
- "prioriteit" (Hoog/Middel/Laag): als bij de invalshoek een "prioriteit" is meegegeven (uit de scorekaart), NEEM DIE EXACT OVER — dat is de door de strateeg goedgekeurde weging. Alleen als er géén prioriteit is meegegeven, weeg je zelf af op aansluiting bij pijnpunt/wens/kans, persona-bereik en bewustzijnsfase. Maak in de onderbouwing kort expliciet waarom deze prioriteit past.
- "onderbouwing": 1-3 zinnen die transparant maken WAAROM dit concept in de matrix staat. Benoem concreet (a) waarom deze invalshoek kansrijk is — koppel het aan een specifiek pijnpunt, wens, bezwaar of kans uit de trigger map — en (b) waarom je deze prioriteit geeft. Dit is de verantwoording die de strateeg leest om je keuze te kunnen controleren; wees specifiek, niet generiek.
- BEWUSTZIJNS-PLAATSING (met herclassificatie): de fase beschrijft wat de persoon al weet en bepaalt de taak van de creative. Onbewust = vertel een verhaal (geen product/bewijs/aanbod); Probleembewust = benoem de pijn (nog geen USP's/bewijs/aanbod); Oplossingsbewust = jouw aanpak versus de rest (USP's, uitleg, vergelijking); Productbewust = bewijs en bezwaren (SOCIAL PROOF, garanties, bezwaar omdraaien); Meest bewust = prijs en deadline (aanbod, actie, urgentie). Neem de fase van de invalshoek over, MAAR corrigeer 'm als 'ie duidelijk fout staat (bv. social proof / "X sterren uit Y reviews" / vergelijking in Onbewust of Probleembewust → verplaats naar Oplossings-/Productbewust).
- SCOPE/STURING: als er onder "Sturing" beschikbare middelen (formats) staan, kies "format" UITSLUITEND daaruit. Als er gekozen bewustzijnsfases of persona's staan, beperk je je daartoe (maak alleen concepten voor die fases/persona's).
- DOELSTELLING/KPI: als er een doelstelling of target onder "Sturing" staat, laat dat meewegen in prioriteit en onderbouwing (bij rendementsfocus wegen conversiegerichte invalshoeken — Productbewust/Meest bewust — zwaarder).
- LEARNINGS-LOOP: als er "Learnings uit eerdere testrondes" zijn meegegeven, bouw daar expliciet op voort — neem de winnende eigenschappen (format/structuur/creator) als vertrekpunt, verwerk de "volgende stap"-suggesties, en stel GEEN ontkrachte invalshoeken opnieuw voor. Verwijs in de onderbouwing kort naar de learning waarop je voortbouwt.
- Taal: Nederlands. Gebruik de taal van de doelgroep waar passend. Baseer je op de trigger map — geen aannames.`;

export async function genereerMatrix(
	tm: TriggerMapContext,
	richtlijnen?: string,
	learnings?: LearningsContext,
	config?: MatrixConfig
) {
	// Gearchiveerde invalshoeken tellen niet meer mee; fase-scope beperkt de bewustzijnsfases.
	const faseScope = config?.bewustzijnsfases?.length ? new Set(config.bewustzijnsfases) : null;
	const actieveInvalshoeken = (tm.invalshoeken ?? [])
		.filter((i) => !i.gearchiveerd)
		.filter((i) => !faseScope || faseScope.has(String(i.bewustzijn)));

	const sturing: string[] = [];
	if (config?.personas?.length)
		sturing.push(`Richt je UITSLUITEND op deze persona's: ${config.personas.join('; ')}.`);
	if (config?.bewustzijnsfases?.length)
		sturing.push(
			`Maak alleen concepten voor deze bewustzijnsfases: ${config.bewustzijnsfases.join(', ')}.`
		);
	if (config?.middelen?.length)
		sturing.push(
			`Beschikbare middelen (kies "format" UITSLUITEND hieruit): ${config.middelen.join(', ')}.`
		);
	if (config?.doelstelling) sturing.push(`Doelstelling/KPI-focus: ${config.doelstelling}.`);
	if (config?.target?.trim()) sturing.push(`Concreet target: ${config.target.trim()}.`);

	const context = [
		sturing.length ? '## Sturing (scope & middelen)\n' + sturing.join('\n') : '',
		'## Trigger map',
		actieveInvalshoeken.length
			? 'Invalshoeken (per bewustzijnsfase; status + eventueel de vastgestelde prioriteit uit de scorekaart tussen haakjes):\n' +
				actieveInvalshoeken
					.map(
						(i) =>
							`- [${i.bewustzijn ?? '?'}] ${i.naam ?? ''} (${i.status ?? 'Nieuw'}${i.prioriteit ? `, prioriteit: ${i.prioriteit}` : ''}): ${i.omschrijving ?? ''}` +
							(i.onderbouwing ? `\n    Onderbouwing: ${i.onderbouwing}` : '')
					)
					.join('\n') +
				'\n\nMaak concepten voor invalshoeken die nog NIET succesvol getest zijn (sla "Getest — werkt" over tenzij er te weinig overblijven).'
			: '',
		tm.personas?.length
			? "Persona's / doelgroep-segmenten (weeg mee bij prioriteit — een invalshoek die een belangrijk segment raakt weegt zwaarder):\n" +
				tm.personas
					.map(
						(p) =>
							`- ${p.naam ?? ''}: ${p.omschrijving ?? ''} (behoefte: ${p.kernbehoefte ?? '?'}; bezwaar: ${p.kernbezwaar ?? '?'})`
					)
					.join('\n')
			: '',
		tm.pijnpunten?.length ? `Pijnpunten: ${tm.pijnpunten.join('; ')}` : '',
		tm.wensen?.length ? `Wensen: ${tm.wensen.join('; ')}` : '',
		tm.bezwaren?.length ? `Bezwaren: ${tm.bezwaren.join('; ')}` : '',
		tm.taal_doelgroep?.length ? `Taal doelgroep: ${tm.taal_doelgroep.join('; ')}` : '',
		tm.kansen_vs_concurrenten?.length
			? `Kansen t.o.v. concurrenten: ${tm.kansen_vs_concurrenten.join('; ')}`
			: '',
		learnings?.winnaars?.length || learnings?.werkt?.length || learnings?.werktNiet?.length
			? [
					'## Learnings uit eerdere testrondes (BOUW HIEROP VOORT)',
					learnings.winnaars?.length
						? 'Winnende concepten (houd de winnende eigenschappen als vertrekpunt aan):\n' +
							learnings.winnaars
								.map(
									(w) =>
										`- [${w.bewustzijn ?? '?'}] "${w.invalshoek ?? ''}" — ${[w.format, w.structuur, w.creator_type].filter(Boolean).join(' / ') || 'geen dims'}` +
										(w.wat_werkte ? `\n    Wat werkte: ${w.wat_werkte}` : '') +
										(w.volgende_stap ? `\n    Volgende stap: ${w.volgende_stap}` : '') +
										(w.observatie ? `\n    Observatie: ${w.observatie}` : '')
								)
								.join('\n')
						: '',
					learnings.werkt?.length
						? `Bevestigde invalshoeken (werken — bouw hierop voort): ${learnings.werkt.join('; ')}`
						: '',
					learnings.werktNiet?.length
						? `Ontkrachte invalshoeken (NIET opnieuw voorstellen): ${learnings.werktNiet.join('; ')}`
						: ''
				]
					.filter(Boolean)
					.join('\n')
			: '',
		richtlijnen?.trim()
			? `## Extra sturing van de strateeg (VERWERK DIT expliciet in de concepten en/of prioriteit)\n${richtlijnen.trim()}`
			: ''
	]
		.filter(Boolean)
		.join('\n\n');

	// effort 'low': de context (persona's, invalshoek-onderbouwing, sturing) is al rijk aangeleverd,
	// dus veel extra denkwerk is niet nodig. 'high'/'medium' liepen tegen ~100s/~88s aan (over de
	// Vercel-timeout van 60s); 'low' houdt de kwaliteit op peil en de duur ruim onder de limiet.
	const res = await claudeJSON<{ concepten: VoorgesteldConcept[] }>(SYSTEM, context, SCHEMA, 16000, 'low');
	// De AI kiest de bewustzijnsfase (awareness); de legacy-funnelfase wordt eruit afgeleid.
	res.data.concepten = res.data.concepten.map((c) => {
		// De proxy dwingt het schema niet af → AI-waarde normaliseren; onbekend blijft leeg.
		const awareness = normaliseerBewustzijn(c.awareness);
		return { ...c, awareness, funnelfase: funnelUitBewustzijn(awareness) };
	});
	return res;
}
