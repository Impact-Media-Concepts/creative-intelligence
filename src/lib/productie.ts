/** Types en definities voor de productie-/shootlaag (Stap 3). */

/** 5-beats videoscript: Hook → Probleem → Oplossing → Resultaat → CTA. */
export interface Script {
	hook: string;
	probleem: string;
	oplossing: string;
	resultaat: string;
	cta: string;
	/** Advertentietekst (feed/story); optioneel, bewaard in hetzelfde JSON-veld (geen migratie nodig). */
	advertentie?: Advertentie;
	/** Beeldaanwijzing per scène (wat zie je in beeld?); optioneel, bewaard in hetzelfde JSON-veld. */
	beeld?: Partial<Record<ScriptBeat, string>>;
}

/** De drie tekstvelden van een Meta-advertentie. */
export interface Advertentie {
	primair: string;
	kop: string;
	omschrijving: string;
}

export const LEEG_ADVERTENTIE: Advertentie = { primair: '', kop: '', omschrijving: '' };

/** Labels, hints en adviesgrenzen (Meta kapt langere teksten af in de feed). */
export const ADVERTENTIE_VELDEN: Array<{
	key: keyof Advertentie;
	label: string;
	hint: string;
	max: number;
	rijen: number;
}> = [
	{ key: 'primair', label: 'Primaire tekst', hint: 'De tekst boven de afbeelding/video. De eerste ±125 tekens zijn zichtbaar voor "Meer tonen" — begin dus sterk.', max: 300, rijen: 5 },
	{ key: 'kop', label: 'Kop', hint: 'De vetgedrukte regel naast de knop.', max: 40, rijen: 2 },
	{ key: 'omschrijving', label: 'Omschrijving', hint: 'Optionele regel onder de kop.', max: 30, rijen: 2 }
];

/** Maakt van onbetrouwbare invoer een geldige Advertentie. */
export function normAdvertentie(v: unknown): Advertentie {
	const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
	return {
		primair: String(o.primair ?? ''),
		kop: String(o.kop ?? ''),
		omschrijving: String(o.omschrijving ?? '')
	};
}

export const LEEG_SCRIPT: Script = {
	hook: '',
	probleem: '',
	oplossing: '',
	resultaat: '',
	cta: ''
};

/** De vijf beats van het script (zonder de advertentietekst). */
export type ScriptBeat = Exclude<keyof Script, 'advertentie' | 'beeld'>;

/** Labels + rendervolgorde van de script-beats. */
export const SCRIPT_BEATS: Array<{ key: ScriptBeat; label: string; hint: string }> = [
	{ key: 'hook', label: 'Hook (0–3s)', hint: 'Waarmee stopt de kijker met scrollen?' },
	{ key: 'probleem', label: 'Probleem', hint: 'Het pijnpunt dat de doelgroep herkent.' },
	{ key: 'oplossing', label: 'Oplossing', hint: 'Hoe het aanbod dat oplost.' },
	{ key: 'resultaat', label: 'Resultaat', hint: 'Het resultaat vanuit de persoon zelf.' },
	{ key: 'cta', label: 'CTA', hint: 'De call-to-action (mag in-camera).' }
];
