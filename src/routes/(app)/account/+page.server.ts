import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

const MIN_LENGTE = 10;

export const actions: Actions = {
	wachtwoord: async ({ request, locals: { supabase, user } }) => {
		if (!user?.email) return fail(401, { foutmelding: 'Niet ingelogd.' });

		const fd = await request.formData();
		const huidig = String(fd.get('huidig') ?? '');
		const nieuw = String(fd.get('nieuw') ?? '');
		const herhaal = String(fd.get('herhaal') ?? '');

		if (!huidig || !nieuw) return fail(400, { foutmelding: 'Vul je huidige en je nieuwe wachtwoord in.' });
		if (nieuw.length < MIN_LENGTE) return fail(400, { foutmelding: `Kies een nieuw wachtwoord van minimaal ${MIN_LENGTE} tekens.` });
		if (nieuw !== herhaal) return fail(400, { foutmelding: 'De twee nieuwe wachtwoorden zijn niet gelijk.' });
		if (nieuw === huidig) return fail(400, { foutmelding: 'Het nieuwe wachtwoord moet anders zijn dan het huidige.' });

		// Eerst het huidige wachtwoord bevestigen, zodat alleen de eigenaar van het account dit kan wijzigen.
		const check = await supabase.auth.signInWithPassword({ email: user.email, password: huidig });
		if (check.error) return fail(400, { foutmelding: 'Je huidige wachtwoord klopt niet.' });

		const { error } = await supabase.auth.updateUser({ password: nieuw });
		if (error) return fail(400, { foutmelding: 'Wijzigen mislukt: ' + error.message });

		return { ok: true };
	}
};
