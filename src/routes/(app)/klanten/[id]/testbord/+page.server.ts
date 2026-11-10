import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	// select('*'): werkt ook als de kolom `doel` (migratie 0016) nog niet bestaat; dan is alles "Aankoop".
	const { data } = await supabase
		.from('concepts')
		.select('*')
		.eq('client_id', params.id)
		.eq('gearchiveerd', false)
		.order('volgorde', { ascending: true });
	return { concepten: data ?? [] };
};
