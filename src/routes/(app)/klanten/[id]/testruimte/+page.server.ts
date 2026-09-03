import type { PageServerLoad } from './$types';
import type { Invalshoek } from '$lib/trigger-map';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const id = params.id;

	const [tm, concepten] = await Promise.all([
		supabase
			.from('trigger_map_versions')
			.select('invalshoeken')
			.eq('client_id', id)
			.eq('is_actief', true)
			.maybeSingle(),
		supabase.from('concepts').select('aanbod').eq('client_id', id).eq('gearchiveerd', false)
	]);

	const invalshoeken = ((tm.data?.invalshoeken as Invalshoek[] | null) ?? []).filter(
		(i) => !i.gearchiveerd
	);
	// Aanbod-opties uit bestaande concepten (tot de intake-koppeling er is).
	const aanbodOpties = [
		...new Set(
			(concepten.data ?? [])
				.map((c) => c.aanbod)
				.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
		)
	];

	return { invalshoeken, aanbodOpties, heeftTriggerMap: !!tm.data };
};
