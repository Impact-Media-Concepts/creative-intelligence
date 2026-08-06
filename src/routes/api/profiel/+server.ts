import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';

export const POST: RequestHandler = async ({ request, locals: { user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (body?.type === 'rondleiding_gezien') {
		// Service-role: zet de vlag voor de ingelogde gebruiker (scope op eigen id).
		const { error: dbFout } = await supabaseAdmin
			.from('profiles')
			.update({ rondleiding_gezien: !!body.waarde })
			.eq('id', user.id);
		if (dbFout) error(500, dbFout.message);
		return json({ ok: true });
	}

	error(400, 'Onbekend type');
};
