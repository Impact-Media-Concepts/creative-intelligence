import { claudeJSON } from './claude';
import type { StrategiePlan } from '$lib/testplan';

/** Sturing van de strateeg (uit de teststrategie-configuratie). */
export interface StrategieConfig {
	personas?: string[];
	bewustzijnsfases?: string[];
	middelen?: string[];
	/** Doelstelling/KPI-focus, bv. "Awareness / engagement" of "Direct rendement (CPA/ROAS)". */
	doelstelling?: string;
	/** Concreet target, bv. "streef-ROAS 3, max CPA €30" (vrije tekst). */
	target?: string;
	/** Max. aantal varianten per schone test (soft cap; default 3). */
	maxVarianten?: number;
	/** Mogen sprints uit verschillende bewustzijnsfases parallel draaien? */
	parallel?: boolean;
}

export interface StrategieContext {
	pijnpunten?: string[];
	wensen?: string[];
	bezwaren?: string[];
	kansen_vs_concurrenten?: string[];
	personas?: Array<{ naam?: string; omschrijving?: string; kernbehoefte?: string; kernbezwaar?: string }>;
	invalshoeken?: Array<{
		naam?: string;
		omschrijving?: string;
		onderbouwing?: string;
		bewustzijn?: string;
		status?: string;
		gearchiveerd?: boolean;
		/** Afgeleide prioriteit uit de scorekaart (RICE), indien gescoord. */
		prioriteit?: string;
	}>;
	/** Learnings uit eerdere rondes (bevestigde/ontkrachte invalshoeken). */
	werkt?: string[];
	werktNiet?: string[];
}

const SPRINT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		titel: { type: 'string' },
		focus: { type: 'string' },
		concepten: { type: 'array', items: { type: 'string' } },
		wat_testen: { type: 'string' },
		succescriterium: { type: 'string' },
		budget: { type: 'string' },
		duur: { type: 'string' },
		ronde: { type: 'integer' }
	},
	required: ['titel', 'focus', 'concepten', 'wat_testen', 'succescriterium', 'budget', 'duur', 'ronde']
};

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		samenvatting: { type: 'string' },
		doelgroep: { type: 'string' },
		funnelaanpak: { type: 'string' },
		sprints: { type: 'array', items: SPRINT_SCHEMA },
		aannames: { type: 'array', items: { type: 'string' } }
	},
	required: ['samenvatting', 'doelgroep', 'funnelaanpak', 'sprints', 'aannames']
};

const SYSTEM = `Je bent de AI Content Strategy Expert bij Social Ads bureau Online Klik. Vóórdat de variabelenmatrix wordt gemaakt, stel je een STRATEGISCH PLAN VAN AANPAK op dat de strateeg eerst goedkeurt. Doel: samen afstemmen, zodat de matrix daarna niet meer bijgesteld hoeft te worden.

Geef output ALLEEN als valide JSON in dit formaat:
{
  "samenvatting": "kernstrategie + belangrijkste keuzes en waarom (2-4 zinnen)",
  "doelgroep": "welke persona('s) en waarom (of 'geen specifieke persona')",
  "funnelaanpak": "welke bewustzijnsfases, in welke volgorde, en waarom",
  "sprints": [
    { "titel": "Sprint 1 — ...", "focus": "persona + bewustzijnsfase", "concepten": ["invalshoek A", "invalshoek B", "invalshoek C"], "wat_testen": "welke variabele wordt geïsoleerd en waarom", "succescriterium": "meetbaar (drempel + termijn)", "budget": "indicatie", "duur": "bijv. 2 weken", "ronde": 1 }
  ],
  "aannames": ["aanname 1", "aanname 2"]
}

METHODE — schoon testen (STRIKT):
- Testvolgorde is Invalshoek → Format → Structuur → Creator: isoleer per sprint ÉÉN variabele, houd de rest gelijk.
- Begin per bewustzijnsfase met een invalshoek-test die de relevante invalshoeken van die fase tegelijk als varianten draait (variabele = invalshoek). Zet die invalshoeken in "concepten". Zijn er in aangrenzende fases maar weinig invalshoeken, combineer ze dan in één test in plaats van vijf losse sprints te plannen.
- DATA-GEDREVEN, niet padden: plan alleen tests die de data rechtvaardigt. Passen alle relevante invalshoeken van een fase in één test (≤ max varianten)? Doe dan ÉÉN invalshoek-test en ga daarna door naar de volgende variabele (format/structuur/creator) op de winnaar. Verzin GEEN extra rondes om het plan te vullen.
- Zijn er MEER relevante invalshoeken dan de max varianten per test? Plan dan meerdere invalshoek-rondes (winnaar draagt door → volgende batch) vóór je naar de volgende variabele gaat.
- Respecteer de "max varianten per test" uit de sturing (default 3 als niet opgegeven).

PARALLEL & RONDES ("ronde"):
- Geef elke sprint een "ronde"-nummer. Sprints met hetzelfde rondenummer draaien PARALLEL.
- Als parallel testen is toegestaan: laat sprints uit verschillende bewustzijnsfases (bv. Probleembewust en Productbewust) in dezelfde ronde parallel lopen. Vervolgsprints (die op een winnaar voortbouwen) komen in een latere ronde.
- Als parallel NIET is toegestaan: geef elke sprint een oplopend, uniek rondenummer (puur sequentieel).

BEWUSTZIJNSFASES & HERCLASSIFICATIE:
- De fase beschrijft wat de persoon al weet en bepaalt de taak van de creative: Onbewust = vertel een verhaal (geen product/bewijs/aanbod); Probleembewust = benoem de pijn; Oplossingsbewust = jouw aanpak versus de rest (USP's, uitleg, vergelijking); Productbewust = bewijs en bezwaren (SOCIAL PROOF: reviews/ratings/cijfers, garanties); Meest bewust = prijs en deadline (aanbod, actie, urgentie).
- Staat een invalshoek in een duidelijk VERKEERDE fase (bv. social proof / "X sterren uit Y reviews" / vergelijking in Onbewust of Probleembewust)? Plaats 'm dan in de JUISTE fase en benoem die correctie kort in de samenvatting of aannames.

KPI / DOELSTELLING:
- Vertel altijd een verhaal langs alle relevante bewustzijnsfases, maar stem de "succescriterium" van elke sprint af op de doelstelling/target uit de sturing.
- Bij focus op rendement (CPA/ROAS/aankopen/add-to-cart): geef Productbewust-/Meest-bewust-sprints een harde resultaat-norm (bv. ROAS/CPA-target) en geef ook de eerdere fases (Onbewust t/m Oplossingsbewust) een secundaire conversie-guardrail naast de engagement-metric. Bij awareness-focus: engagement/hook rate/CTR leidend. Verwerk een concreet target letterlijk als het is opgegeven.

REGELS:
- Respecteer de sturing (persona-scope, bewustzijnsfases, beschikbare middelen) STRIKT; kies formats alleen uit de beschikbare middelen.
- Gebruik de invalshoeken BREED: prioriteer op RICE (high eerst / meer budget) i.p.v. invalshoeken uit te sluiten. Meer persona's = meer sprints/ad sets = meer testing; benoem dat.
- Bouw voort op bevestigde invalshoeken; stel ontkrachte niet opnieuw voor.
- Wees concreet en navolgbaar: de strateeg moet je keuzes kunnen controleren. Benoem expliciete "aannames".
- Als er FEEDBACK van de strateeg is meegegeven: verwerk die leidend in een herzien plan.
- Taal: Nederlands. Baseer je op de aangeleverde data — geen aannames verzinnen die niet uit de data volgen.`;

function bouwContext(ctx: StrategieContext, config: StrategieConfig, feedback?: string): string {
	const faseScope = config.bewustzijnsfases?.length ? new Set(config.bewustzijnsfases) : null;
	const inv = (ctx.invalshoeken ?? [])
		.filter((i) => !i.gearchiveerd)
		.filter((i) => !faseScope || faseScope.has(String(i.bewustzijn)));

	const sturing: string[] = [];
	if (config.personas?.length) sturing.push(`Persona-scope: ${config.personas.join('; ')}`);
	if (config.bewustzijnsfases?.length)
		sturing.push(`Bewustzijnsfases: ${config.bewustzijnsfases.join(', ')}`);
	if (config.middelen?.length) sturing.push(`Beschikbare middelen: ${config.middelen.join(', ')}`);
	if (config.doelstelling) sturing.push(`Doelstelling/KPI-focus: ${config.doelstelling}`);
	if (config.target?.trim()) sturing.push(`Concreet target: ${config.target.trim()}`);
	sturing.push(`Max varianten per test: ${config.maxVarianten && config.maxVarianten > 0 ? config.maxVarianten : 3}`);
	sturing.push(`Parallel testen toegestaan: ${config.parallel ? 'ja' : 'nee'}`);

	return [
		sturing.length ? '## Sturing van de strateeg\n' + sturing.join('\n') : '',
		inv.length
			? '## Invalshoeken (test-backlog; per bewustzijnsfase, met prioriteit)\n' +
				inv
					.map(
						(i) =>
							`- [${i.bewustzijn ?? '?'}] ${i.naam ?? ''}${i.prioriteit ? ` (prioriteit: ${i.prioriteit})` : ''}: ${i.omschrijving ?? ''}` +
							(i.onderbouwing ? `\n    Onderbouwing: ${i.onderbouwing}` : '')
					)
					.join('\n')
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
		ctx.pijnpunten?.length ? `## Pijnpunten\n${ctx.pijnpunten.join('; ')}` : '',
		ctx.wensen?.length ? `## Wensen\n${ctx.wensen.join('; ')}` : '',
		ctx.bezwaren?.length ? `## Bezwaren\n${ctx.bezwaren.join('; ')}` : '',
		ctx.kansen_vs_concurrenten?.length ? `## Kansen t.o.v. concurrenten\n${ctx.kansen_vs_concurrenten.join('; ')}` : '',
		ctx.werkt?.length ? `## Bevestigde invalshoeken (werken)\n${ctx.werkt.join('; ')}` : '',
		ctx.werktNiet?.length ? `## Ontkrachte invalshoeken (niet opnieuw)\n${ctx.werktNiet.join('; ')}` : '',
		feedback?.trim() ? `## Feedback van de strateeg (VERWERK DIT leidend in een herzien plan)\n${feedback.trim()}` : ''
	]
		.filter(Boolean)
		.join('\n\n');
}

/** Stelt een strategisch plan van aanpak op (afstem-interview vóór de matrix). */
export async function genereerStrategiePlan(
	ctx: StrategieContext,
	config: StrategieConfig,
	feedback?: string
) {
	// effort 'medium': strategische redenering, maar één call met beperkte output → binnen 60s.
	return claudeJSON<StrategiePlan>(SYSTEM, bouwContext(ctx, config, feedback), SCHEMA, 16000, 'medium');
}
