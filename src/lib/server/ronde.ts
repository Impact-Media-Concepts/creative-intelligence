import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Testrondes: het volgende rondenummer voor een klant, en concepten plaatsen mét dat nummer.
 * Werkt ook zolang migratie 0017 (kolom `concepts.ronde`) nog niet is gedraaid: dan wordt er
 * gewoon geen rondenummer vastgelegd.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function volgendeRonde(supabase: Db, clientId: string): Promise<number | null> {
	const { data, error } = await supabase
		.from('concepts')
		.select('ronde')
		.eq('client_id', clientId)
		.not('ronde', 'is', null)
		.order('ronde', { ascending: false })
		.limit(1);
	if (error) return null; // kolom bestaat nog niet
	const max = Number((data?.[0] as { ronde?: number } | undefined)?.ronde ?? 0);
	return (Number.isFinite(max) ? max : 0) + 1;
}

export async function plaatsConcepten(supabase: Db, rijen: Array<Record<string, unknown>>, ronde: number | null) {
	const metRonde = ronde == null ? rijen : rijen.map((r) => ({ ...r, ronde }));
	const res = await supabase.from('concepts').insert(metRonde).select('*');
	if (res.error && ronde != null && /ronde/i.test(res.error.message)) {
		return supabase.from('concepts').insert(rijen).select('*');
	}
	return res;
}
