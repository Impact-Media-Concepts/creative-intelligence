/**
 * Gedeelde status van lopende achtergrondtaken (AI-generaties). Blijft bestaan als je
 * naar een ander tabje navigeert, zodat de taak zichtbaar doorloopt.
 */
class Taken {
	lijst = $state<{ id: number; label: string }[]>([]);
}

export const taken = new Taken();

let _teller = 0;

/** Registreer een lopende taak; geeft een id terug om 'm later te stoppen. */
export function startTaak(label: string): number {
	const id = ++_teller;
	taken.lijst = [...taken.lijst, { id, label }];
	return id;
}

/** Beëindig een lopende taak. */
export function stopTaak(id: number): void {
	taken.lijst = taken.lijst.filter((t) => t.id !== id);
}
