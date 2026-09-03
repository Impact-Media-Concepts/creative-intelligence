/** Types en definities voor de productie-/shootlaag (Stap 3). */

/** 5-beats videoscript: Hook → Probleem → Oplossing → Resultaat → CTA. */
export interface Script {
	hook: string;
	probleem: string;
	oplossing: string;
	resultaat: string;
	cta: string;
}

export const LEEG_SCRIPT: Script = {
	hook: '',
	probleem: '',
	oplossing: '',
	resultaat: '',
	cta: ''
};

/** Labels + rendervolgorde van de script-beats. */
export const SCRIPT_BEATS: Array<{ key: keyof Script; label: string; hint: string }> = [
	{ key: 'hook', label: 'Hook (0–3s)', hint: 'Waarmee stopt de kijker met scrollen?' },
	{ key: 'probleem', label: 'Probleem', hint: 'Het pijnpunt dat de doelgroep herkent.' },
	{ key: 'oplossing', label: 'Oplossing', hint: 'Hoe het aanbod dat oplost.' },
	{ key: 'resultaat', label: 'Resultaat', hint: 'Het resultaat vanuit de persoon zelf.' },
	{ key: 'cta', label: 'CTA', hint: 'De call-to-action (mag in-camera).' }
];
