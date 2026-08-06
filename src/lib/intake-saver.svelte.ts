/** Intake-specifieke wrapper rond de generieke saver-helper. */
import { saver, postJSON, type PostOpties } from './saver.svelte';

export { saver };

/** POST naar de intake-API. Werkt de gedeelde saver-status bij. */
export function postIntake<T = unknown>(body: unknown, opties?: PostOpties): Promise<T> {
	return postJSON<T>('/api/intake', body, opties);
}
