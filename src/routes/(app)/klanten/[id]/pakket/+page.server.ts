import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const { data } = await supabase
		.from('concepts')
		.select('*')
		.eq('client_id', params.id)
		.eq('gearchiveerd', false)
		.order('created_at', { ascending: true });

	return { concepten: data ?? [] };
};
