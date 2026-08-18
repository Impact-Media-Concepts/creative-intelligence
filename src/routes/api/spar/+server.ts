import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { claudeChat, type ChatBericht } from '$lib/server/claude';

// Chatbeurt via de proxy; ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

const ONDERWERPEN = ['matrix', 'plan'] as const;
type Onderwerp = (typeof ONDERWERPEN)[number];

const ONDERWERP_LABEL: Record<Onderwerp, string> = {
	matrix: 'variabelenmatrix (testopzet)',
	plan: 'plan van aanpak (teststrategie)'
};

/** Bouwt het contextblok (trigger map + huidige opzet + sturing) voor de strateeg. */
async function bouwContext(
	supabase: App.Locals['supabase'],
	clientId: string,
	onderwerp: Onderwerp,
	extraContext: string
): Promise<string> {
	const delen: string[] = [];

	const { data: tm } = await supabase
		.from('trigger_map_versions')
		.select('pijnpunten, wensen, bezwaren, taal_doelgroep, kansen_vs_concurrenten, personas, invalshoeken')
		.eq('client_id', clientId)
		.eq('is_actief', true)
		.maybeSingle();

	if (tm) {
		const inv = (tm.invalshoeken as Array<Record<string, unknown>> | null) ?? [];
		if (inv.length)
			delen.push(
				'## Invalshoeken (trigger map)\n' +
					inv
						.filter((i) => !i.gearchiveerd)
						.map((i) => `- [${i.funnelfase ?? '?'}] ${i.naam ?? ''} (${i.status ?? 'Nieuw'})`)
						.join('\n')
			);
		const pijn = (tm.pijnpunten as string[] | null) ?? [];
		const wens = (tm.wensen as string[] | null) ?? [];
		const bezw = (tm.bezwaren as string[] | null) ?? [];
		if (pijn.length) delen.push(`Pijnpunten: ${pijn.join('; ')}`);
		if (wens.length) delen.push(`Wensen: ${wens.join('; ')}`);
		if (bezw.length) delen.push(`Bezwaren: ${bezw.join('; ')}`);
		const personas = (tm.personas as Array<{ naam?: string; omschrijving?: string }> | null) ?? [];
		if (personas.length)
			delen.push(
				"Persona's: " + personas.map((p) => `${p.naam ?? ''} (${p.omschrijving ?? ''})`).join('; ')
			);
	}

	if (onderwerp === 'matrix') {
		const { data: concepten } = await supabase
			.from('concepts')
			.select('funnelfase, invalshoek, format, structuur, creator_type, variabele, prioriteit')
			.eq('client_id', clientId)
			.eq('gearchiveerd', false)
			.order('created_at', { ascending: true });
		const lijst = concepten ?? [];
		if (lijst.length)
			delen.push(
				'## Huidige matrix (de concepten die nu voorgesteld staan)\n' +
					lijst
						.map(
							(c) =>
								`- [${c.funnelfase ?? '?'}] ${c.invalshoek ?? ''} — format: ${c.format ?? '?'}, structuur: ${c.structuur ?? '?'}, creator: ${c.creator_type ?? '?'}, test: ${c.variabele ?? '?'}, prioriteit: ${c.prioriteit ?? '?'}`
						)
						.join('\n')
			);
	}

	if (extraContext.trim()) delen.push('## Huidige opzet / sturing\n' + extraContext.trim());

	return delen.join('\n\n');
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	const clientId = String(body.clientId ?? '');
	if (!clientId) error(400, 'Ontbrekende klant');
	const onderwerp: Onderwerp = ONDERWERPEN.includes(body.onderwerp) ? body.onderwerp : 'matrix';

	// Toegang afdwingen via RLS.
	const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle();
	if (!client) error(403, 'Geen toegang tot deze klant');

	/** Laadt de berichtgeschiedenis (leeg als tabel nog niet bestaat / migratie niet gedraaid). */
	async function laadHistorie(): Promise<ChatBericht[]> {
		const { data } = await supabase
			.from('spar_berichten')
			.select('rol, tekst')
			.eq('client_id', clientId)
			.eq('onderwerp', onderwerp)
			.order('created_at', { ascending: true });
		return (data ?? []).slice(-24).map((b) => ({ role: b.rol, content: b.tekst }));
	}

	switch (body.type) {
		case 'bericht': {
			const tekst = String(body.tekst ?? '').trim();
			if (!tekst) error(400, 'Leeg bericht');
			const extraContext = body.context == null ? '' : String(body.context);

			const historie = await laadHistorie();
			const context = await bouwContext(supabase, clientId, onderwerp, extraContext);

			const system =
				`Je bent een ervaren Creative Social Ads Strateeg bij Online Klik. Je SPART met een collega over de ${ONDERWERP_LABEL[onderwerp]} — je denkt mee, stelt scherpe vragen en geeft onderbouwd advies, maar je WIJZIGT niets; jullie bespreken het alleen.\n\n` +
				`Werkwijze:\n` +
				`- Kort en concreet (geen lappen tekst). Stel een verduidelijkende vraag als dat helpt.\n` +
				`- Baseer je op de trigger map en de huidige opzet hieronder; verzin geen data.\n` +
				`- Respecteer de beschikbare middelen: is er alleen static content, stel dan geen video/UGC voor en noem klantcontent "klantvisual", niet "UGC".\n` +
				`- Houd "schoon testen" in gedachten: in de eerste ronde varieert alleen de invalshoek, de rest blijft per funnelfase gelijk.\n` +
				`- Zodra jullie het eens zijn over concrete wijzigingen, vat die kort en puntsgewijs samen zodat de collega ze kan doorvoeren.\n\n` +
				(context ? `# Context\n${context}` : '');

			const messages: ChatBericht[] = [...historie, { role: 'user', content: tekst }];
			const res = await claudeChat(system, messages, 2000);

			// Bewaren (niet-fataal: werkt ook als de migratie nog niet gedraaid is).
			try {
				await supabase.from('spar_berichten').insert([
					{ client_id: clientId, onderwerp, rol: 'user', tekst, gebruiker_id: user.id },
					{ client_id: clientId, onderwerp, rol: 'assistant', tekst: res.antwoord }
				]);
			} catch {
				// opslaan mislukt — gesprek werkt nog steeds
			}

			return json({ antwoord: res.antwoord });
		}

		// Distilleert het gesprek tot een concrete sturing om door te voeren.
		case 'samenvatting': {
			const historie = await laadHistorie();
			if (!historie.length) error(400, 'Nog geen gesprek om samen te vatten');
			const system =
				`Vat het volgende sparringsgesprek over de ${ONDERWERP_LABEL[onderwerp]} samen als een heldere, concrete set instructies om door te voeren. ` +
				`Alleen de afgesproken wijzigingen, imperatief en puntsgewijs (bijv. "- Verplaats invalshoek X naar MOFU"). ` +
				`Geen inleiding, geen uitleg, geen slotzin — alleen de bulletlijst. Als er niets concreets is afgesproken, antwoord dan met "GEEN".`;
			const res = await claudeChat(system, historie, 1500);
			return json({ sturing: res.antwoord.trim() });
		}

		// Gesprek wissen (opnieuw beginnen).
		case 'wis': {
			try {
				await supabase
					.from('spar_berichten')
					.delete()
					.eq('client_id', clientId)
					.eq('onderwerp', onderwerp);
			} catch {
				// niets
			}
			return json({ ok: true });
		}

		default:
			error(400, 'Onbekend type');
	}
};
