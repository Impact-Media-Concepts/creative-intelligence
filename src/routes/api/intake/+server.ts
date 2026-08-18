import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/database.types';
import { BRON1_VRAGEN, BRON2_VRAGEN } from '$lib/intake-vragen';
import { parseIntakeDocument, parseIntakeBestand } from '$lib/server/intake-parser';
import type { IntakeParseResultaat } from '$lib/server/intake-parser';
import { haalPaginaTekst, scanConcurrentWebsite, scanReviews } from '$lib/server/web-scan';
import { CLAUDE_MODEL } from '$lib/server/claude';

type Bron5Insert = Database['public']['Tables']['intake_bron5']['Insert'];

const BRON1_NUMMERS = new Set(BRON1_VRAGEN.map((v) => v.nummer));
const BRON2_NUMMERS = new Set(BRON2_VRAGEN.map((v) => v.nummer));

/** Maximale lengte van een aangeleverd document (tekens) om runaway-kosten te voorkomen. */
const MAX_DOC_LENGTE = 100_000;

// De 'parse'-actie roept Claude aan (adaptive thinking); ruimere Vercel-functietimeout.
export const config = { maxDuration: 300 };

const BRON3_VELDEN = [
	'naam',
	'url',
	'meta_ad_library',
	'invalshoeken',
	'website_taal',
	'tiktok_observaties',
	'kansen'
];
const BRON4_VELDEN = ['platform', 'bron_naam', 'ruwe_tekst'];
const BRON6_VELDEN = ['titel', 'inhoud'];
const BRON5_VELDEN = [
	'beste_advertenties',
	'best_verkopende_producten',
	'search_console',
	'organische_posts'
];

/** Beperkt een patch-object tot toegestane velden. */
function schoonPatch(patch: unknown, toegestaan: string[]): Record<string, string | null> {
	const uit: Record<string, string | null> = {};
	if (patch && typeof patch === 'object') {
		for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
			if (toegestaan.includes(k)) uit[k] = v == null ? null : String(v);
		}
	}
	return uit;
}

/** Zet een parse-resultaat om naar een schoon voorstel (alleen gevulde, geldige items). */
function bouwVoorstel(data: IntakeParseResultaat) {
	const filter = (
		lijst: Array<{ vraag_nummer: number; antwoord: string }> | undefined,
		geldig: Set<number>
	) =>
		(lijst ?? [])
			.filter((a) => geldig.has(a.vraag_nummer) && a.antwoord && a.antwoord.trim().length > 0)
			.map((a) => ({ vraag_nummer: a.vraag_nummer, antwoord: a.antwoord.trim() }));

	const bron3 = (data.bron3 ?? [])
		.filter((c) => c?.naam && c.naam.trim().length > 0)
		.map((c) => ({
			naam: (c.naam ?? '').trim(),
			url: (c.url ?? '').trim(),
			meta_ad_library: (c.meta_ad_library ?? '').trim(),
			invalshoeken: (c.invalshoeken ?? '').trim(),
			website_taal: (c.website_taal ?? '').trim(),
			tiktok_observaties: (c.tiktok_observaties ?? '').trim(),
			kansen: (c.kansen ?? '').trim()
		}));
	const bron4 = (data.bron4 ?? [])
		.filter((r) => r?.samenvatting && r.samenvatting.trim().length > 0)
		.map((r) => ({
			platform: (r.platform ?? '').trim(),
			bron_naam: (r.bron_naam ?? '').trim(),
			samenvatting: (r.samenvatting ?? '').trim()
		}));

	return {
		bron1: filter(data.bron1, BRON1_NUMMERS),
		bron2: filter(data.bron2, BRON2_NUMMERS),
		bron3,
		bron4
	};
}

export const POST: RequestHandler = async ({ request, locals: { supabase, user } }) => {
	if (!user) error(401, 'Niet ingelogd');

	const body = await request.json().catch(() => null);
	if (!body || typeof body.type !== 'string') error(400, 'Ongeldig verzoek');

	const { type } = body;
	const sb = supabase;

	switch (type) {
		case 'bron1':
		case 'bron2': {
			const tabel = type === 'bron1' ? 'intake_bron1' : 'intake_bron2';
			const clientId = String(body.clientId ?? '');
			const vraagNummer = Number(body.vraagNummer);
			const max = type === 'bron1' ? BRON1_VRAGEN.length : BRON2_VRAGEN.length;
			const min = type === 'bron1' ? 1 : 0; // bron2: 0 = "niet beschikbaar"-sentinel
			if (!clientId || !Number.isInteger(vraagNummer) || vraagNummer < min || vraagNummer > max) {
				error(400, 'Ongeldige vraag');
			}
			const antwoord = body.antwoord == null ? null : String(body.antwoord);
			const { error: dbFout } = await sb
				.from(tabel)
				.upsert(
					{ client_id: clientId, vraag_nummer: vraagNummer, antwoord },
					{ onConflict: 'client_id,vraag_nummer' }
				);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'bron5': {
			const clientId = String(body.clientId ?? '');
			const veld = String(body.veld ?? '');
			if (!clientId || !BRON5_VELDEN.includes(veld)) error(400, 'Ongeldig veld');
			const waarde = body.waarde == null ? null : String(body.waarde);
			const payload = { client_id: clientId } as Bron5Insert;
			(payload as Record<string, unknown>)[veld] = waarde;
			const { error: dbFout } = await sb
				.from('intake_bron5')
				.upsert(payload, { onConflict: 'client_id' });
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'bron3.insert':
		case 'bron4.insert': {
			const tabel = type === 'bron3.insert' ? 'intake_bron3_concurrenten' : 'intake_bron4';
			const velden = type === 'bron3.insert' ? BRON3_VELDEN : BRON4_VELDEN;
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			// Optionele beginwaarden (bijv. uit een document-analyse) direct meenemen.
			const patch = schoonPatch(body.velden, velden);
			const { data, error: dbFout } = await sb
				.from(tabel)
				.insert({ client_id: clientId, ...patch })
				.select('*')
				.single();
			if (dbFout || !data) error(500, dbFout?.message ?? 'Aanmaken mislukt');
			return json({ id: data.id, rij: data });
		}

		case 'bron3.update':
		case 'bron4.update': {
			const tabel = type === 'bron3.update' ? 'intake_bron3_concurrenten' : 'intake_bron4';
			const velden = type === 'bron3.update' ? BRON3_VELDEN : BRON4_VELDEN;
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const patch = schoonPatch(body.patch, velden);
			if (Object.keys(patch).length === 0) return json({ ok: true });
			const { error: dbFout } = await sb.from(tabel).update(patch as never).eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'bron3.delete':
		case 'bron4.delete': {
			const tabel = type === 'bron3.delete' ? 'intake_bron3_concurrenten' : 'intake_bron4';
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const { error: dbFout } = await sb.from(tabel).delete().eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'bron6.insert': {
			const clientId = String(body.clientId ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			const { data, error: dbFout } = await sb
				.from('intake_bron6')
				.insert({ client_id: clientId })
				.select('id')
				.single();
			if (dbFout || !data) error(500, dbFout?.message ?? 'Aanmaken mislukt');
			return json({ id: data.id });
		}

		case 'bron6.update': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const patch = schoonPatch(body.patch, BRON6_VELDEN);
			if (Object.keys(patch).length === 0) return json({ ok: true });
			const { error: dbFout } = await sb.from('intake_bron6').update(patch as never).eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'bron6.delete': {
			const id = String(body.id ?? '');
			if (!id) error(400, 'Ontbrekend id');
			const { error: dbFout } = await sb.from('intake_bron6').delete().eq('id', id);
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true });
		}

		case 'scan_concurrent': {
			const id = String(body.id ?? '');
			const url = String(body.url ?? '').trim();
			const clientId = String(body.clientId ?? '');
			if (!id || !url) error(400, 'Ontbrekend id of URL');

			try {
				const tekst = await haalPaginaTekst(url);
				const res = await scanConcurrentWebsite(tekst, body.naam ? String(body.naam) : null);

				await sb.from('ai_logs').insert({
					client_id: clientId || null,
					gebruiker_id: user.id,
					module: 'concurrent_scan',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				const velden = {
					invalshoeken: res.data.invalshoeken,
					website_taal: res.data.website_taal,
					kansen: res.data.kansen
				};
				const { error: dbFout } = await sb
					.from('intake_bron3_concurrenten')
					.update(velden as never)
					.eq('id', id);
				if (dbFout) error(500, dbFout.message);
				return json({ velden });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await sb.from('ai_logs').insert({
					client_id: clientId || null,
					gebruiker_id: user.id,
					module: 'concurrent_scan',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Scan mislukt: ' + msg);
			}
			break;
		}

		case 'scan_reviews': {
			const id = String(body.id ?? '');
			const url = String(body.url ?? '').trim();
			const clientId = String(body.clientId ?? '');
			if (!id || !url) error(400, 'Ontbrekend id of URL');

			try {
				const tekst = await haalPaginaTekst(url);
				const res = await scanReviews(tekst);

				await sb.from('ai_logs').insert({
					client_id: clientId || null,
					gebruiker_id: user.id,
					module: 'review_scan',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				const ruwe_tekst = res.data.samenvatting;
				const { error: dbFout } = await sb
					.from('intake_bron4')
					.update({ ruwe_tekst } as never)
					.eq('id', id);
				if (dbFout) error(500, dbFout.message);
				return json({ ruwe_tekst });
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await sb.from('ai_logs').insert({
					client_id: clientId || null,
					gebruiker_id: user.id,
					module: 'review_scan',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Scan mislukt: ' + msg);
			}
			break;
		}

		case 'parse': {
			const clientId = String(body.clientId ?? '');
			const tekst = String(body.tekst ?? '').trim();
			if (!clientId) error(400, 'Ontbrekende klant');
			if (tekst.length < 20) error(400, 'Document is te kort om te analyseren.');
			if (tekst.length > MAX_DOC_LENGTE) {
				error(400, `Document is te lang (max ${MAX_DOC_LENGTE.toLocaleString('nl-NL')} tekens).`);
			}

			try {
				const res = await parseIntakeDocument(tekst);

				await sb.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'intake_parse',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});

				return json(bouwVoorstel(res.data));
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await sb.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'intake_parse',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Document analyseren mislukt: ' + msg);
			}
			break;
		}

		case 'parse_bestand': {
			const clientId = String(body.clientId ?? '');
			const base64 = String(body.base64 ?? '');
			const mediaType = String(body.mediaType ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			if (!base64) error(400, 'Geen bestand ontvangen.');
			const toegestaan = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
			if (!toegestaan.includes(mediaType)) error(400, 'Bestandstype niet ondersteund.');
			// base64 is ~4/3 van de bytegrootte; ~16M tekens ≈ 12 MB bestand.
			if (base64.length > 16_000_000) error(400, 'Bestand te groot (max ~12 MB).');

			try {
				const res = await parseIntakeBestand(base64, mediaType);
				await sb.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'intake_parse',
					model: res.model,
					prompt: res.prompt,
					response: res.response,
					tokens_input: res.tokensInput,
					tokens_output: res.tokensOutput,
					duur_ms: res.duurMs
				});
				return json(bouwVoorstel(res.data));
			} catch (e) {
				const msg = e instanceof Error ? e.message : 'onbekende fout';
				await sb.from('ai_logs').insert({
					client_id: clientId,
					gebruiker_id: user.id,
					module: 'intake_parse',
					model: CLAUDE_MODEL,
					response: 'FOUT: ' + msg
				});
				error(500, 'Bestand analyseren mislukt: ' + msg);
			}
			break;
		}

		case 'bulk': {
			const clientId = String(body.clientId ?? '');
			const bron = String(body.bron ?? '');
			if (!clientId) error(400, 'Ontbrekende klant');
			if (bron !== 'bron1' && bron !== 'bron2') error(400, 'Ongeldige bron');

			const geldig = bron === 'bron1' ? BRON1_NUMMERS : BRON2_NUMMERS;
			const rijen = Array.isArray(body.antwoorden) ? body.antwoorden : [];
			const payload = rijen
				.map((r: unknown) => {
					const o = (r ?? {}) as Record<string, unknown>;
					const nummer = Number(o.vraag_nummer);
					return { client_id: clientId, vraag_nummer: nummer, antwoord: String(o.antwoord ?? '') };
				})
				.filter((r: { vraag_nummer: number }) => Number.isInteger(r.vraag_nummer) && geldig.has(r.vraag_nummer));
			if (payload.length === 0) return json({ ok: true, aantal: 0 });

			const tabel = bron === 'bron1' ? 'intake_bron1' : 'intake_bron2';
			const { error: dbFout } = await sb
				.from(tabel)
				.upsert(payload, { onConflict: 'client_id,vraag_nummer' });
			if (dbFout) error(500, dbFout.message);
			return json({ ok: true, aantal: payload.length });
		}

		default:
			error(400, 'Onbekend type');
	}

	error(500, 'Onbereikbaar');
};
