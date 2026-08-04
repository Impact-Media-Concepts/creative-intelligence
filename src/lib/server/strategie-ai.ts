import { claudeJSON } from './claude';
import type { StrategiePlan } from '$lib/testplan';

/** Sturing van de strateeg (uit de teststrategie-configuratie). */
export interface StrategieConfig {
	personas?: string[];
	funnelfases?: string[];
	middelen?: string[];
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
		funnelfase?: string;
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
		duur: { type: 'string' }
	},
	required: ['titel', 'focus', 'concepten', 'wat_testen', 'succescriterium', 'budget', 'duur']
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
  "funnelaanpak": "welke funnellagen, in welke volgorde, en waarom",
  "sprints": [
    { "titel": "Sprint 1 — ...", "focus": "persona + funnellaag", "concepten": ["invalshoek A", "invalshoek B", "invalshoek C"], "wat_testen": "welke variabele wordt geïsoleerd en waarom", "succescriterium": "meetbaar (drempel + termijn)", "budget": "indicatie", "duur": "bijv. 2 weken" }
  ],
  "aannames": ["aanname 1", "aanname 2"]
}

METHODE — schoon testen (STRIKT):
- Testvolgorde is Invalshoek → Format → Structuur → Creator.
- Maak PER funnellaag ÉÉN invalshoek-test-sprint die ALLE invalshoeken van die laag tegelijk als varianten draait (variabele = invalshoek; format/structuur/creator gelijk). Dus niet 2 invalshoeken in sprint 1 en de rest later — alle invalshoeken van die laag samen in één test. Zet die invalshoeken in "concepten".
- Zo mappt het plan 1-op-1 op de matrix (per funnel = 1 invalshoek-sprint met die invalshoeken).
- Pas ná een winnende invalshoek volgen vervolgsprints die de volgende variabele (format → structuur → creator) op de winnaar testen.

FUNNEL-VOLGORDE & LOGICA:
- Respecteer de gekozen funnellagen en volgorde uit de sturing. Zonder sturing: bepaal zelf een logische volgorde en leg 'm uit in "funnelaanpak".
- TOFU = awareness/pijnpunt/herkenning; MOFU = overweging/USP/vergelijking/social proof; BOFU = conversie/aanbod/garantie/urgentie.

REGELS:
- Respecteer de sturing (persona-scope, funnellagen, beschikbare middelen) STRIKT als die is meegegeven; kies formats alleen uit de beschikbare middelen.
- Meer persona's = meer sprints/ad sets = meer testing; verwerk dat in de sprints en benoem het.
- Gebruik de RICE-prioriteit voor de volgorde/nadruk. Bouw voort op bevestigde invalshoeken; stel ontkrachte niet opnieuw voor.
- Wees concreet en navolgbaar: de strateeg moet je keuzes kunnen controleren. Benoem expliciete "aannames".
- Als er FEEDBACK van de strateeg is meegegeven: verwerk die leidend in een herzien plan.
- Taal: Nederlands. Baseer je op de aangeleverde data — geen aannames verzinnen die niet uit de data volgen.`;

function bouwContext(ctx: StrategieContext, config: StrategieConfig, feedback?: string): string {
	const funnelScope = config.funnelfases?.length ? new Set(config.funnelfases) : null;
	const inv = (ctx.invalshoeken ?? [])
		.filter((i) => !i.gearchiveerd)
		.filter((i) => !funnelScope || funnelScope.has(String(i.funnelfase)));

	const sturing: string[] = [];
	if (config.personas?.length) sturing.push(`Persona-scope: ${config.personas.join('; ')}`);
	if (config.funnelfases?.length) sturing.push(`Funnellagen: ${config.funnelfases.join(', ')}`);
	if (config.middelen?.length) sturing.push(`Beschikbare middelen: ${config.middelen.join(', ')}`);

	return [
		sturing.length ? '## Sturing van de strateeg\n' + sturing.join('\n') : '',
		inv.length
			? '## Invalshoeken (test-backlog; per funnelfase, met prioriteit)\n' +
				inv
					.map(
						(i) =>
							`- [${i.funnelfase ?? '?'}] ${i.naam ?? ''}${i.prioriteit ? ` (prioriteit: ${i.prioriteit})` : ''}: ${i.omschrijving ?? ''}` +
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
