/**
 * De loop in vijf stappen (zoals in de klantpresentaties): Begrijpen → Bepalen → Maken → Testen → Leren.
 * Zuivere logica (geen netwerk): uit de voortgang van een klant volgt per stap of die klaar is, nu aan de
 * beurt is, of nog moet wachten. Zo toont het klantoverzicht altijd waar je staat en wat de volgende stap is.
 */

export interface LoopInvoer {
	intakePct: number;
	heeftTriggerMap: boolean;
	invalshoeken: number;
	concepten: number;
	metBrief: number;
	live: number;
	getest: number;
	winnaars: number;
}

export type LoopStatus = 'klaar' | 'nu' | 'later';

export interface LoopStap {
	sleutel: 'begrijpen' | 'bepalen' | 'maken' | 'testen' | 'leren';
	nummer: number;
	naam: string;
	/** Eén zin: wat doe je in deze stap? */
	taak: string;
	/** Waar zijn we nu in deze stap? (korte cijfers) */
	stand: string;
	status: LoopStatus;
	/** Subpad binnen /klanten/[id]. */
	pad: string;
	/** Tekst op de knop als deze stap aan de beurt is. */
	actie: string;
}

const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function bouwLoop(i: LoopInvoer): LoopStap[] {
	const alleBriefs = i.concepten > 0 && i.metBrief >= i.concepten;
	const klaar = {
		begrijpen: i.heeftTriggerMap,
		bepalen: i.concepten > 0,
		maken: alleBriefs,
		testen: i.concepten > 0 && (i.winnaars > 0 || i.getest >= i.concepten),
		leren: i.winnaars > 0
	};

	const stappen: Omit<LoopStap, 'status'>[] = [
		{
			sleutel: 'begrijpen',
			nummer: 1,
			naam: 'Begrijpen',
			taak: 'Intake en trigger map: wat willen, vrezen en zeggen klanten?',
			stand: i.heeftTriggerMap
				? meervoud(i.invalshoeken, 'invalshoek', 'invalshoeken')
				: `Intake ${i.intakePct}% ingevuld`,
			pad: i.heeftTriggerMap ? '/triggermap' : i.intakePct < 25 ? '/intake' : '/triggermap',
			actie: i.heeftTriggerMap ? 'Naar de trigger map' : i.intakePct < 25 ? 'Naar de intake' : 'Maak de trigger map'
		},
		{
			sleutel: 'bepalen',
			nummer: 2,
			naam: 'Bepalen',
			taak: 'Kies wat je deze ronde test, per bewustzijnsfase.',
			stand: i.concepten > 0 ? meervoud(i.concepten, 'concept', 'concepten') : 'Nog geen testset',
			pad: '/testruimte',
			actie: 'Naar de testruimte'
		},
		{
			sleutel: 'maken',
			nummer: 3,
			naam: 'Maken',
			taak: 'Briefing, script en advertentietekst per concept.',
			stand: i.concepten > 0 ? `${i.metBrief} van ${i.concepten} briefs` : 'Wacht op concepten',
			pad: '/productie',
			actie: 'Naar de creatie'
		},
		{
			sleutel: 'testen',
			nummer: 4,
			naam: 'Testen',
			taak: 'Zet live en volg wie voorloopt en wie achterloopt.',
			stand: i.live > 0 ? `${i.live} live · ${i.getest} getest` : i.getest > 0 ? `${i.getest} getest` : 'Nog niets live',
			pad: '/sprint',
			actie: 'Naar de resultaten'
		},
		{
			sleutel: 'leren',
			nummer: 5,
			naam: 'Leren',
			taak: 'Kies de winnaars en bouw voort in de volgende ronde.',
			stand: meervoud(i.winnaars, 'winnaar', 'winnaars'),
			pad: '/learnings',
			actie: 'Naar de learnings'
		}
	];

	// De eerste stap die nog niet klaar is, is aan de beurt. Alles ervoor is klaar, alles erna wacht.
	let nuGezet = false;
	return stappen.map((s) => {
		let status: LoopStatus;
		if (klaar[s.sleutel] && !nuGezet) status = 'klaar';
		else if (!nuGezet) {
			status = 'nu';
			nuGezet = true;
		} else status = 'later';
		return { ...s, status };
	});
}

/** Alles klaar? Dan is de volgende ronde de logische stap (de loop sluit zich). */
export function loopRondIsAf(stappen: LoopStap[]): boolean {
	return stappen.every((s) => s.status === 'klaar');
}
