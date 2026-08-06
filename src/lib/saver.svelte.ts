/** Gedeelde auto-save status + generieke POST-helper. */
import { invalidateAll } from '$app/navigation';
import { startTaak, stopTaak } from './taken.svelte';

class Saver {
	actief = $state(0);
	fout = $state<string | null>(null);
	laatstOpgeslagen = $state<number | null>(null);
}

export const saver = new Saver();

/**
 * Opties voor een lange generatie:
 * - taak: label voor de app-brede achtergrondtaak-indicator (blijft staan bij navigeren).
 * - ververs: na afloop de paginadata opnieuw laden, zodat het resultaat verschijnt
 *   ook als je intussen naar een ander tabje bent gegaan.
 */
export interface PostOpties {
	taak?: string;
	ververs?: boolean;
}

/** POST JSON naar een endpoint en werk de gedeelde saver-status bij. */
export async function postJSON<T = unknown>(
	url: string,
	body: unknown,
	opties?: PostOpties
): Promise<T> {
	const taakId = opties?.taak ? startTaak(opties.taak) : null;
	saver.actief++;
	saver.fout = null;
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const tekst = await res.text().catch(() => '');
			throw new Error(tekst || `Opslaan mislukt (${res.status})`);
		}
		saver.laatstOpgeslagen = Date.now();
		const data = (await res.json().catch(() => ({}))) as T;
		// Data verversen zodat het resultaat overal verschijnt (ook na navigeren).
		if (taakId !== null && opties?.ververs) await invalidateAll().catch(() => {});
		return data;
	} catch (e) {
		saver.fout = e instanceof Error ? e.message : 'Opslaan mislukt';
		throw e;
	} finally {
		saver.actief--;
		if (taakId !== null) stopTaak(taakId);
	}
}
