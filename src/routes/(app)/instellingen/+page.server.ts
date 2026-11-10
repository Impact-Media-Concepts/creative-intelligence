import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { supabaseAdmin } from '$lib/server/supabase-admin';
import { leesBureauTokenStatus, bewaarBureauToken } from '$lib/server/meta/bureau-token';
import { testAdLibraryToken } from '$lib/server/meta/ad-library';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data: profielen } = await supabase
		.from('profiles')
		.select('id, naam, rol, created_at')
		.order('created_at', { ascending: true });

	const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
	const emailMap = new Map(authData.users.map((u) => [u.id, u.email ?? '']));

	const gebruikers = (profielen ?? []).map((p) => ({
		...p,
		email: emailMap.get(p.id) ?? ''
	}));

	return { gebruikers, adlibToken: await leesBureauTokenStatus() };
};

export const actions: Actions = {
	// Meta Ad Library-token van het bureau: de admin plakt een token uit de Graph API Explorer, de server wisselt
	// het in voor een langlopend token en test het meteen. Het token wordt nooit teruggestuurd naar de browser.
	adlibToken: async ({ request, locals: { supabase, user } }) => {
		const { data: isAdmin } = await supabase.rpc('is_admin');
		if (!isAdmin || !user) return fail(403, { foutmelding: 'Alleen een admin kan dit instellen.' });

		const fd = await request.formData();
		const kort = String(fd.get('token') ?? '').trim();
		if (kort.length < 40) return fail(400, { foutmelding: 'Dat lijkt geen geldig Meta-token. Plak het volledige token uit de Graph API Explorer.' });

		try {
			const { langToken, verloopt_at } = await bewaarBureauToken(kort, user.id);
			const test = await testAdLibraryToken(langToken);
			return { adlibOk: true, adlibGetest: test.ok, adlibMelding: test.melding, adlibVerloopt: verloopt_at };
		} catch (e) {
			return fail(400, { foutmelding: e instanceof Error ? e.message : 'Token opslaan mislukt.' });
		}
	},

	aanmaken: async ({ request }) => {
		const fd = await request.formData();
		const naam = String(fd.get('naam') ?? '').trim();
		const email = String(fd.get('email') ?? '').trim();
		const wachtwoord = String(fd.get('wachtwoord') ?? '');
		const rol = String(fd.get('rol') ?? 'gebruiker');

		if (!email || wachtwoord.length < 8) {
			return fail(400, {
				foutmelding: 'E-mailadres en een wachtwoord van minimaal 8 tekens zijn verplicht.'
			});
		}

		const { data, error: e } = await supabaseAdmin.auth.admin.createUser({
			email,
			password: wachtwoord,
			email_confirm: true,
			user_metadata: { naam: naam || email }
		});
		if (e || !data.user) {
			return fail(400, { foutmelding: 'Aanmaken mislukt: ' + (e?.message ?? 'onbekende fout') });
		}
		if (rol === 'admin') {
			await supabaseAdmin.from('profiles').update({ rol: 'admin' }).eq('id', data.user.id);
		}
		return { ok: true, aangemaakt: email };
	},

	rolWijzigen: async ({ request, locals: { user } }) => {
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		const rol = String(fd.get('rol') ?? '');
		if (!['admin', 'gebruiker'].includes(rol)) {
			return fail(400, { foutmelding: 'Ongeldige rol.' });
		}
		if (id === user!.id) {
			return fail(400, { foutmelding: 'Je kunt je eigen rol niet wijzigen.' });
		}
		const { error: e } = await supabaseAdmin
			.from('profiles')
			.update({ rol: rol as 'admin' | 'gebruiker' })
			.eq('id', id);
		if (e) return fail(500, { foutmelding: 'Wijzigen mislukt: ' + e.message });
		return { ok: true };
	},

	verwijderen: async ({ request, locals: { user } }) => {
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		if (id === user!.id) {
			return fail(400, { foutmelding: 'Je kunt je eigen account niet verwijderen.' });
		}
		const { error: e } = await supabaseAdmin.auth.admin.deleteUser(id);
		if (e) return fail(500, { foutmelding: 'Verwijderen mislukt: ' + e.message });
		return { ok: true };
	}
};
