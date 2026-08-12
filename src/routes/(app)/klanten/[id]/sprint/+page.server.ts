import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const id = params.id;

	const [concepten, tm, connectie, metaAds] = await Promise.all([
		supabase
			.from('concepts')
			.select('*')
			.eq('client_id', id)
			.eq('gearchiveerd', false)
			.order('created_at', { ascending: true }),
		supabase
			.from('trigger_map_versions')
			.select('id')
			.eq('client_id', id)
			.eq('is_actief', true)
			.maybeSingle(),
		supabase
			.from('meta_connections')
			.select(
				'id, ad_account_id, ad_account_naam, currency, losgekoppeld_at, laatste_sync_at, laatste_sync_status, laatste_sync_fout, token_verloopt_at'
			)
			.eq('client_id', id)
			.maybeSingle(),
		supabase
			.from('meta_ads')
			.select('external_id, naam, status, laatste_metrics')
			.eq('client_id', id)
			.order('naam', { ascending: true })
	]);

	const conn = connectie.data && !connectie.data.losgekoppeld_at ? connectie.data : null;

	return {
		concepten: concepten.data ?? [],
		heeftTriggerMap: !!tm.data,
		metaConnectie: conn,
		metaAds: conn ? (metaAds.data ?? []) : []
	};
};
