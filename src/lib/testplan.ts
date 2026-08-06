/** Types voor het AI-gegenereerde stap-voor-stap testplan (onder de matrix). */

/** Eén sprint/stap in het testplan. */
export interface TestplanSprint {
	titel: string;
	focus: string;
	concepten: string[];
	wat_testen: string;
	succescriterium: string;
	budget: string;
	duur: string;
	/** Ronde-nummer: sprints met hetzelfde rondenummer kunnen parallel draaien. */
	ronde?: number;
}

/** Volledig testplan: korte toelichting op de aanpak + de sprints op volgorde. */
export interface Testplan {
	toelichting: string;
	sprints: TestplanSprint[];
}

/**
 * Strategisch plan van aanpak (afstem-interviewstap tussen trigger map en matrix).
 * Hergebruikt TestplanSprint, zodat het na goedkeuren 1-op-1 het testplan wordt en
 * matrix + testplan consistent zijn.
 */
export interface StrategiePlan {
	/** Kernstrategie + belangrijkste keuzes en waarom (2-4 zinnen). */
	samenvatting: string;
	/** Welke persona('s) en waarom (of "geen specifieke persona"). */
	doelgroep: string;
	/** Welke funnellagen, in welke volgorde, en waarom. */
	funnelaanpak: string;
	/** De teststructuur (schoon testen) = de sprints op volgorde. */
	sprints: TestplanSprint[];
	/** Expliciete aannames die de strateeg kan bevestigen/bijstellen. */
	aannames: string[];
}

/** Labels + rendervolgorde voor de sprint-velden. */
export const SPRINT_VELDEN: Array<{ key: keyof TestplanSprint; label: string }> = [
	{ key: 'focus', label: 'Focus' },
	{ key: 'wat_testen', label: 'Wat testen we' },
	{ key: 'succescriterium', label: 'Succescriterium' },
	{ key: 'budget', label: 'Budget' },
	{ key: 'duur', label: 'Duur' }
];
