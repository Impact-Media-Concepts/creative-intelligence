import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { syncConnection } from '$lib/server/meta/sync';
import type { RequestHandler } from './$types';

// Dagelijkse sync over alle koppelingen; ruime timeout.
export const config = { maxDuration: 60 };

/** Controleert het Vercel-cron-secret (Authorization: Bearer <CRON_SECRET>). */
function checkCronSecret(request: Request) {
	const verwacht = env.CRON_SECRET;
	if (!verwacht) throw error(500, 'CRON_SECRET niet geconfigureerd');
	const header = request.headers.get('authorization') ?? '';
	const kandidaat = header.startsWith('Bearer ') ? header.slice(7) : header;
	if (kandidaat !== verwacht) throw error(401, 'Verboden');
}

export const GET: RequestHandler = async ({ request }) => {
	checkCronSecret(request);

	const { data: connecties, error: dbFout } = await supabaseAdmin
		.from('meta_connections')
		.select('*')
		.is('losgekoppeld_at', null);
	if (dbFout) throw error(500, dbFout.message);

	const resultaten: Array<{ client_id: string; ok: boolean; fout?: string; stats?: unknown }> = [];
	for (const conn of connecties ?? []) {
		const res = await syncConnection(supabaseAdmin, conn);
		resultaten.push({ client_id: conn.client_id, ok: res.ok, fout: res.fout, stats: res.stats });
	}

	return json({ ok: true, aantal: resultaten.length, resultaten });
};
