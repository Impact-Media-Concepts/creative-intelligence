import type { PageServerLoad } from './$types';
import type { Invalshoek, Persona } from '$lib/trigger-map';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const id = params.id;

	const [concepten, tm, spar] = await Promise.all([
		supabase.from('concepts').select('*').eq('client_id', id).order('created_at', { ascending: true }),
		supabase
			.from('trigger_map_versions')
			.select('id, invalshoeken, personas')
			.eq('client_id', id)
			.eq('is_actief', true)
			.maybeSingle(),
		// Spar-gesprek over de matrix (leeg als migratie 0012 nog niet gedraaid is — .data blijft null).
		supabase
			.from('spar_berichten')
			.select('rol, tekst, created_at')
			.eq('client_id', id)
			.eq('onderwerp', 'matrix')
			.order('created_at', { ascending: true })
	]);

	return {
		concepten: concepten.data ?? [],
		invalshoeken: (tm.data?.invalshoeken as Invalshoek[] | null) ?? [],
		personas: ((tm.data as { personas?: Persona[] | null } | null)?.personas as Persona[] | null) ?? [],
		versieId: tm.data?.id ?? null,
		heeftTriggerMap: !!tm.data,
		sparBerichten: spar.data ?? []
	};
};
