/**
 * Resultaten-scorebord — de beslislogica (zuiver, client-safe, geen database).
 *
 * Doel: bij elke testgroep in één oogopslag laten zien WIE LEIDT, HOE ZEKER dat is, WAT ER NOG
 * ONTBREEKT voor een betrouwbare uitslag, en welke varianten je beter kunt STOPPEN.
 *
 * Een testgroep = concepten met dezelfde bewustzijnsfase én dezelfde geteste variabele
 * (appels met appels: een Onbewust-publiek vergelijk je niet met een Productbewust-publiek).
 *
 * Alles hier is een ADVIES. Er wordt nooit automatisch iets gestopt of gemarkeerd.
 */

import { GUARDRAIL, type MetaMetrics } from './meta';
import { bewustzijnVan, type Bewustzijn } from './trigger-map';

export interface ResConcept {
	id: string;
	invalshoek: string | null;
	variabele: string | null;
	funnelfase: string | null;
	awareness: string | null;
	is_winnaar: boolean;
	auto_winnaar: boolean;
	hook_rate: number | null;
	ctr: number | null;
	roas: number | null;
	cpa: number | null;
	/** Ruwe Meta-cijfers (alleen aanwezig als de advertentie gekoppeld is). */
	meta_metrics: unknown;
}

export type Metric = 'roas' | 'ctr' | 'hook_rate';
export type Oordeel = 'winnaar' | 'leidt' | 'achter' | 'stop' | 'te_vroeg' | 'geen_data';
/** Hoe zeker is het verschil met de nummer twee? */
export type Zekerheid = 'zeker' | 'waarschijnlijk' | 'te_vroeg';
export type GroepStatus = 'winnaar' | 'klaar' | 'loopt' | 'geen_data';

export interface Voortgang {
	label: string;
	nu: number;
	doel: number;
	ok: boolean;
	/** Weergave van nu/doel. */
	tekst: string;
}

export interface LidResultaat {
	id: string;
	naam: string;
	waarde: number | null;
	waardeLabel: string;
	oordeel: Oordeel;
	reden: string;
	/** Uitgegeven bedrag in euro's (alleen met Meta-cijfers). */
	spendEuro: number | null;
	cpa: number | null;
	/** Hoeveel procent boven/onder de leider (negatief = achter). Alleen voor niet-leiders. */
	t_o_v_leider: number | null;
	voortgang: Voortgang[] | null;
	handmatig: boolean;
	isWinnaar: boolean;
	autoWinnaar: boolean;
}

export interface GroepResultaat {
	sleutel: string;
	fase: Bewustzijn;
	variabele: string;
	metric: Metric | null;
	metricLabel: string;
	status: GroepStatus;
	kopregel: string;
	uitleg: string;
	zekerheid: Zekerheid | null;
	leiderId: string | null;
	leden: LidResultaat[];
}

const METRIC_LABEL: Record<Metric, string> = { roas: 'ROAS', ctr: 'CTR', hook_rate: 'Hook rate' };

/** Een variant ligt zó ver achter de leider (en heeft genoeg data) dat stoppen te overwegen is. */
const STOP_ACHTERSTAND = 0.4;

export function leesMetaMetrics(v: unknown): MetaMetrics | null {
	if (!v || typeof v !== 'object') return null;
	const m = v as Partial<MetaMetrics>;
	return typeof m.impressions === 'number' && typeof m.spend_cents === 'number' ? (m as MetaMetrics) : null;
}

function formatWaarde(metric: Metric, v: number | null): string {
	if (v == null) return '—';
	return metric === 'roas' ? `${v.toFixed(2)}×` : `${v.toFixed(2)}%`;
}

const euro = (n: number) => `€${Math.round(n).toLocaleString('nl-NL')}`;

function waardeVan(c: ResConcept, metric: Metric): number | null {
	const v = metric === 'roas' ? c.roas : metric === 'ctr' ? c.ctr : c.hook_rate;
	return v != null && Number.isFinite(v) ? v : null;
}

/** Welke drempels haalt deze variant al? Alleen voor varianten met Meta-cijfers. */
function drempels(m: MetaMetrics, metric: Metric): Voortgang[] {
	const lijst: Voortgang[] = [
		{
			label: 'Uitgegeven',
			nu: m.spend_cents / 100,
			doel: GUARDRAIL.minSpendCenten / 100,
			ok: m.spend_cents >= GUARDRAIL.minSpendCenten,
			tekst: `${euro(m.spend_cents / 100)} / ${euro(GUARDRAIL.minSpendCenten / 100)}`
		},
		{
			label: 'Vertoningen',
			nu: m.impressions,
			doel: GUARDRAIL.minImpressies,
			ok: m.impressions >= GUARDRAIL.minImpressies,
			tekst: `${m.impressions.toLocaleString('nl-NL')} / ${GUARDRAIL.minImpressies.toLocaleString('nl-NL')}`
		},
		{
			label: 'Dagen actief',
			nu: m.dagen_actief,
			doel: GUARDRAIL.minDagenActief,
			ok: m.dagen_actief >= GUARDRAIL.minDagenActief,
			tekst: `${m.dagen_actief} / ${GUARDRAIL.minDagenActief}`
		}
	];
	if (metric === 'roas')
		lijst.push({
			label: 'Aankopen',
			nu: m.purchases,
			doel: GUARDRAIL.minConversies,
			ok: m.purchases >= GUARDRAIL.minConversies,
			tekst: `${m.purchases} / ${GUARDRAIL.minConversies}`
		});
	return lijst;
}

const haaltAlles = (v: Voortgang[] | null) => !!v && v.every((x) => x.ok);

/** Tweezijdige z-toets voor twee percentages (CTR of hook rate). null = niet te berekenen. */
function zScore(a: MetaMetrics, b: MetaMetrics, metric: Metric): number | null {
	const x1 = metric === 'hook_rate' ? a.video_3s : a.link_clicks;
	const x2 = metric === 'hook_rate' ? b.video_3s : b.link_clicks;
	const n1 = a.impressions;
	const n2 = b.impressions;
	if (n1 <= 0 || n2 <= 0) return null;
	const p1 = x1 / n1;
	const p2 = x2 / n2;
	const p = (x1 + x2) / (n1 + n2);
	const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
	return se > 0 ? (p1 - p2) / se : null;
}

function zekerheidVan(z: number | null): Zekerheid | null {
	if (z == null) return null;
	const az = Math.abs(z);
	return az >= 1.96 ? 'zeker' : az >= 1.28 ? 'waarschijnlijk' : 'te_vroeg';
}

/** Rekent alle testgroepen door. Groepen met minstens één cijfer komen bovenaan. */
export function berekenResultaten(concepten: ResConcept[]): GroepResultaat[] {
	const groepen = new Map<string, ResConcept[]>();
	for (const c of concepten) {
		const sleutel = `${bewustzijnVan(c)}::${c.variabele ?? 'Onbekend'}`;
		groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), c]);
	}

	const uit: GroepResultaat[] = [];
	for (const [sleutel, leden] of groepen) {
		const fase = bewustzijnVan(leden[0]);
		const variabele = leden[0].variabele ?? 'Onbekend';
		const metas = new Map(leden.map((c) => [c.id, leesMetaMetrics(c.meta_metrics)]));

		// Primaire metric: ROAS zodra er aankopen/ROAS zijn, anders CTR, anders hook rate.
		const heeftAankopen = leden.some(
			(c) => (metas.get(c.id)?.purchases ?? 0) > 0 || (c.roas != null && c.roas > 0)
		);
		const metric: Metric | null = heeftAankopen
			? 'roas'
			: leden.some((c) => c.ctr != null)
				? 'ctr'
				: leden.some((c) => c.hook_rate != null)
					? 'hook_rate'
					: null;

		const maakLid = (c: ResConcept, oordeel: Oordeel, reden: string, tovLeider: number | null): LidResultaat => {
			const m = metas.get(c.id) ?? null;
			return {
				id: c.id,
				naam: c.invalshoek || '(geen invalshoek)',
				waarde: metric ? waardeVan(c, metric) : null,
				waardeLabel: metric ? formatWaarde(metric, waardeVan(c, metric)) : '—',
				oordeel,
				reden,
				spendEuro: m ? m.spend_cents / 100 : null,
				cpa: c.cpa,
				t_o_v_leider: tovLeider,
				voortgang: m && metric ? drempels(m, metric) : null,
				handmatig: !m,
				isWinnaar: c.is_winnaar,
				autoWinnaar: c.auto_winnaar
			};
		};

		// Geen enkel cijfer in de groep.
		if (!metric) {
			uit.push({
				sleutel,
				fase,
				variabele,
				metric: null,
				metricLabel: '',
				status: leden.some((c) => c.is_winnaar) ? 'winnaar' : 'geen_data',
				kopregel: leden.some((c) => c.is_winnaar) ? `Winnaar: ${leden.find((c) => c.is_winnaar)?.invalshoek ?? ''}` : 'Nog geen resultaten',
				uitleg: 'Koppel de advertenties aan Meta of vul de cijfers per concept in om te vergelijken.',
				zekerheid: null,
				leiderId: null,
				leden: leden.map((c) => maakLid(c, c.is_winnaar ? 'winnaar' : 'geen_data', '', null))
			});
			continue;
		}

		const metCijfer = leden
			.filter((c) => waardeVan(c, metric) != null)
			.sort((a, b) => (waardeVan(b, metric) ?? 0) - (waardeVan(a, metric) ?? 0));
		const zonder = leden.filter((c) => waardeVan(c, metric) == null);
		const winnaar = leden.find((c) => c.is_winnaar) ?? null;
		const leider = metCijfer[0] ?? null;
		const tweede = metCijfer[1] ?? null;
		const leiderWaarde = leider ? (waardeVan(leider, metric) ?? 0) : 0;

		// Voorsprong op nummer twee en hoe zeker dat is.
		const voorsprong =
			leider && tweede && (waardeVan(tweede, metric) ?? 0) > 0
				? (leiderWaarde - (waardeVan(tweede, metric) ?? 0)) / (waardeVan(tweede, metric) ?? 1)
				: null;
		const lm = leider ? metas.get(leider.id) ?? null : null;
		const tm = tweede ? metas.get(tweede.id) ?? null : null;
		const leiderDrempels = lm ? haaltAlles(drempels(lm, metric)) : false;

		let zekerheid: Zekerheid | null = null;
		if (lm && tm && metric !== 'roas') zekerheid = zekerheidVan(zScore(lm, tm, metric));
		else if (lm && metric === 'roas')
			zekerheid = leiderDrempels && voorsprong != null && voorsprong >= GUARDRAIL.minVoorsprong ? 'waarschijnlijk' : 'te_vroeg';

		const voorsprongOk = voorsprong != null && voorsprong >= GUARDRAIL.minVoorsprong;
		// 'Klaar' = de leider haalt alle harde drempels, heeft een duidelijke voorsprong en het verschil is niet toevallig.
		const klaar = !winnaar && !!leider && !!tweede && leiderDrempels && voorsprongOk && zekerheid !== 'te_vroeg';

		const ledenUit: LidResultaat[] = [];
		for (const c of metCijfer) {
			const w = waardeVan(c, metric) ?? 0;
			const tov = c.id === leider?.id || leiderWaarde <= 0 ? null : (w - leiderWaarde) / leiderWaarde;
			const m = metas.get(c.id) ?? null;
			if (c.is_winnaar) {
				ledenUit.push(maakLid(c, 'winnaar', 'Als winnaar gemarkeerd.', tov));
			} else if (c.id === leider?.id) {
				const reden = !tweede
					? 'Enige variant met een cijfer — er is nog niets om mee te vergelijken.'
					: klaar
						? 'Leidt duidelijk en haalt alle drempels — klaar om als winnaar te markeren.'
						: 'Leidt voorlopig; de uitslag is nog niet hard genoeg.';
				ledenUit.push(maakLid(c, 'leidt', reden, null));
			} else {
				const achterBeduidend = tov != null && tov <= -STOP_ACHTERSTAND;
				const drempelsOk = m ? haaltAlles(drempels(m, metric)) : false;
				if (m && drempelsOk && achterBeduidend) {
					ledenUit.push(
						maakLid(
							c,
							'stop',
							`${Math.round(Math.abs(tov!) * 100)}% onder de leider, na ${euro(m.spend_cents / 100)} — overweeg te stoppen.`,
							tov
						)
					);
				} else if (m && !drempelsOk) {
					ledenUit.push(maakLid(c, 'te_vroeg', 'Nog te weinig data om dit te beoordelen.', tov));
				} else {
					ledenUit.push(
						maakLid(
							c,
							'achter',
							tov != null ? `${Math.round(Math.abs(tov) * 100)}% onder de leider.` : 'Achter op de leider.',
							tov
						)
					);
				}
			}
		}
		for (const c of zonder) ledenUit.push(maakLid(c, c.is_winnaar ? 'winnaar' : 'geen_data', '', null));

		// Groepskop: wat is de stand en wat is de volgende stap?
		let status: GroepStatus;
		let kopregel: string;
		let uitleg: string;
		if (winnaar) {
			status = 'winnaar';
			kopregel = `Winnaar: ${winnaar.invalshoek ?? ''}`;
			uitleg = 'Deze testgroep is beslist. Maak er een vervolgtest van in de volgende ronde.';
		} else if (klaar && leider) {
			status = 'klaar';
			kopregel = `${leider.invalshoek ?? 'De leider'} lijkt te winnen`;
			uitleg = `${METRIC_LABEL[metric]} ${formatWaarde(metric, leiderWaarde)}, ${Math.round((voorsprong ?? 0) * 100)}% beter dan nummer twee${zekerheid === 'zeker' ? ' en statistisch zeker' : ''}. Controleer en markeer als winnaar.`;
		} else if (leider && tweede) {
			status = 'loopt';
			const ontbreekt = lm
				? drempels(lm, metric)
						.filter((d) => !d.ok)
						.map((d) =>
							d.label === 'Uitgegeven'
								? `nog ${euro(d.doel - d.nu)} spend`
								: d.label === 'Dagen actief'
									? `nog ${Math.ceil(d.doel - d.nu)} dagen`
									: d.label === 'Aankopen'
										? `nog ${Math.ceil(d.doel - d.nu)} aankopen`
										: `nog ${Math.ceil(d.doel - d.nu).toLocaleString('nl-NL')} vertoningen`
						)
				: [];
			kopregel = `${leider.invalshoek ?? 'De leider'} leidt voorlopig`;
			uitleg = !lm
				? `Op basis van handmatige cijfers (${METRIC_LABEL[metric]}). Let zelf op voldoende bereik voordat je beslist.`
				: ontbreekt.length
					? `Nog niet beslist: ${ontbreekt.join(', ')}.`
					: !voorsprongOk
						? `Het verschil met nummer twee (${Math.round((voorsprong ?? 0) * 100)}%) is nog kleiner dan ${Math.round(GUARDRAIL.minVoorsprong * 100)}%.`
						: 'Het verschil kan nog toeval zijn; laat de test nog even doorlopen.';
		} else {
			status = 'loopt';
			kopregel = 'Nog niets om te vergelijken';
			uitleg = 'Er is maar één variant met een cijfer. Zodra een tweede variant resultaten heeft, verschijnt hier de stand.';
		}

		uit.push({
			sleutel,
			fase,
			variabele,
			metric,
			metricLabel: METRIC_LABEL[metric],
			status,
			kopregel,
			uitleg,
			zekerheid,
			leiderId: leider?.id ?? null,
			leden: ledenUit
		});
	}

	// Groepen met inhoud bovenaan, daarna op fase-volgorde.
	const rang: Record<GroepStatus, number> = { klaar: 0, loopt: 1, winnaar: 2, geen_data: 3 };
	return uit.sort((a, b) => rang[a.status] - rang[b.status]);
}
