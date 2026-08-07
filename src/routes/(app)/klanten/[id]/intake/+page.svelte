<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Label } from '$lib/components/ui/label';
	import AutoSaveField from '$lib/components/app/AutoSaveField.svelte';
	import { saver, postIntake } from '$lib/intake-saver.svelte';
	import { startTaak, stopTaak } from '$lib/taken.svelte';
	import { berekenIntakeProgress, heeftInhoud } from '$lib/progress';
	import { cn } from '$lib/utils';
	import {
		BRON1_VRAGEN,
		BRON2_VRAGEN,
		BRON4_PLATFORMS,
		BRON5_VELDEN
	} from '$lib/intake-vragen';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Upload from '@lucide/svelte/icons/upload';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';

	let { data } = $props();
	let clientId = $derived(data.client.id);

	// ---- lokale state uit serverdata ----
	function naarMap(rows: Array<{ vraag_nummer: number; antwoord: string | null }>) {
		const m: Record<number, string> = {};
		for (const r of rows) m[r.vraag_nummer] = r.antwoord ?? '';
		return m;
	}

	// svelte-ignore state_referenced_locally
	let bron1Antw = $state(naarMap(data.bron1));
	// svelte-ignore state_referenced_locally
	let bron2Antw = $state(naarMap(data.bron2.filter((r) => r.vraag_nummer > 0)));
	// svelte-ignore state_referenced_locally
	let bron2Nvt = $state(data.bron2.some((r) => r.vraag_nummer === 0 && heeftInhoud(r.antwoord)));
	// svelte-ignore state_referenced_locally
	let bron3 = $state(data.bron3.map((r) => ({ ...r })));
	// svelte-ignore state_referenced_locally
	let bron4 = $state(data.bron4.map((r) => ({ ...r })));
	// svelte-ignore state_referenced_locally
	let bron5 = $state({
		beste_advertenties: data.bron5?.beste_advertenties ?? '',
		best_verkopende_producten: data.bron5?.best_verkopende_producten ?? '',
		search_console: data.bron5?.search_console ?? '',
		organische_posts: data.bron5?.organische_posts ?? ''
	});

	// svelte-ignore state_referenced_locally
	let bron6 = $state(data.bron6.map((r) => ({ ...r })));

	let actief = $state<'bron1' | 'bron2' | 'bron3' | 'bron4' | 'bron5' | 'bron6'>('bron1');

	// ---- live voortgang ----
	let progress = $derived(
		berekenIntakeProgress({
			bron1Ingevuld: Object.values(bron1Antw).filter(heeftInhoud).length,
			bron2Ingevuld: bron2Nvt ? 5 : Object.values(bron2Antw).filter(heeftInhoud).length,
			bron3Aantal: bron3.length,
			bron4Ingevuld: bron4.filter((r) => heeftInhoud(r.ruwe_tekst)).length,
			bron5Ingevuld: Object.values(bron5).filter(heeftInhoud).length
		})
	);

	let tabs = $derived([
		{ key: 'bron1' as const, label: 'Klantgesprek', pct: progress.bron1 },
		{ key: 'bron2' as const, label: 'Interne interviews', pct: progress.bron2 },
		{ key: 'bron3' as const, label: 'Concurrentie', pct: progress.bron3 },
		{ key: 'bron4' as const, label: 'Reviews', pct: progress.bron4 },
		{ key: 'bron5' as const, label: 'Eigen data', pct: progress.bron5 },
		// Bron 6 is optioneel en telt niet mee in de voortgang; toont een aantal i.p.v. %.
		{ key: 'bron6' as const, label: 'Overig', count: bron6.length }
	]);

	// ---- opslag-acties ----
	function bewaarBron1(nummer: number, waarde: string) {
		bron1Antw[nummer] = waarde;
		return postIntake({ type: 'bron1', clientId, vraagNummer: nummer, antwoord: waarde });
	}
	function bewaarBron2(nummer: number, waarde: string) {
		bron2Antw[nummer] = waarde;
		return postIntake({ type: 'bron2', clientId, vraagNummer: nummer, antwoord: waarde });
	}
	async function toggleNvt() {
		bron2Nvt = !bron2Nvt;
		await postIntake({ type: 'bron2', clientId, vraagNummer: 0, antwoord: bron2Nvt ? '1' : '' });
	}
	function bewaarBron5(veld: keyof typeof bron5, waarde: string) {
		bron5[veld] = waarde;
		return postIntake({ type: 'bron5', clientId, veld, waarde });
	}

	async function voegConcurrentToe() {
		if (bron3.length >= 10) return;
		const { id } = await postIntake<{ id: string }>({ type: 'bron3.insert', clientId });
		bron3.push({
			id,
			client_id: clientId,
			naam: '',
			url: '',
			meta_ad_library: '',
			invalshoeken: '',
			website_taal: '',
			tiktok_observaties: '',
			kansen: '',
			created_at: new Date().toISOString()
		});
	}
	async function verwijderConcurrent(id: string) {
		if (!confirm('Deze concurrent verwijderen?')) return;
		await postIntake({ type: 'bron3.delete', id });
		bron3 = bron3.filter((c) => c.id !== id);
	}
	function bewaarConcurrent(rij: (typeof bron3)[number], veld: string, waarde: string) {
		(rij as Record<string, unknown>)[veld] = waarde;
		return postIntake({ type: 'bron3.update', id: rij.id, patch: { [veld]: waarde } });
	}

	async function voegBron4Toe() {
		const { id } = await postIntake<{ id: string }>({ type: 'bron4.insert', clientId });
		bron4.push({
			id,
			client_id: clientId,
			platform: '',
			bron_naam: '',
			ruwe_tekst: '',
			updated_at: new Date().toISOString()
		});
	}
	async function verwijderBron4(id: string) {
		if (!confirm('Deze bron verwijderen?')) return;
		await postIntake({ type: 'bron4.delete', id });
		bron4 = bron4.filter((r) => r.id !== id);
	}
	function bewaarBron4(rij: (typeof bron4)[number], veld: string, waarde: string) {
		(rij as Record<string, unknown>)[veld] = waarde;
		return postIntake({ type: 'bron4.update', id: rij.id, patch: { [veld]: waarde } });
	}

	// ---- URL-scan (concurrent-website / reviews) — AI vult een voorstel in ----
	let scanBezig = $state<Record<string, boolean>>({});
	let scanFout = $state<string | null>(null);
	let scanKey = $state<Record<string, number>>({}); // forceert reseed van AutoSaveField na scan
	let reviewUrl = $state<Record<string, string>>({});

	async function scanConcurrent(c: (typeof bron3)[number]) {
		const url = (c.url ?? '').trim();
		if (!url) {
			scanFout = 'Vul eerst de URL van de concurrent in.';
			return;
		}
		scanBezig[c.id] = true;
		scanFout = null;
		try {
			const { velden } = await postIntake<{
				velden: { invalshoeken: string; website_taal: string; kansen: string };
			}>({ type: 'scan_concurrent', id: c.id, url, clientId, naam: c.naam }, { taak: 'Website-scan' });
			c.invalshoeken = velden.invalshoeken;
			c.website_taal = velden.website_taal;
			c.kansen = velden.kansen;
			scanKey[c.id] = (scanKey[c.id] ?? 0) + 1;
		} catch (e) {
			scanFout = e instanceof Error ? e.message : 'Scan mislukt';
		} finally {
			scanBezig[c.id] = false;
		}
	}

	async function scanReviewBron(r: (typeof bron4)[number]) {
		const url = (reviewUrl[r.id] ?? '').trim();
		if (!url) {
			scanFout = 'Vul eerst een review-URL in.';
			return;
		}
		scanBezig[r.id] = true;
		scanFout = null;
		try {
			const { ruwe_tekst } = await postIntake<{ ruwe_tekst: string }>(
				{ type: 'scan_reviews', id: r.id, url, clientId },
				{ taak: 'Reviews-scan' }
			);
			r.ruwe_tekst = ruwe_tekst;
			scanKey[r.id] = (scanKey[r.id] ?? 0) + 1;
		} catch (e) {
			scanFout = e instanceof Error ? e.message : 'Scan mislukt';
		} finally {
			scanBezig[r.id] = false;
		}
	}

	async function voegBron6Toe() {
		const { id } = await postIntake<{ id: string }>({ type: 'bron6.insert', clientId });
		bron6.push({
			id,
			client_id: clientId,
			titel: '',
			inhoud: '',
			created_at: new Date().toISOString()
		});
	}
	async function verwijderBron6(id: string) {
		if (!confirm('Dit blok verwijderen?')) return;
		await postIntake({ type: 'bron6.delete', id });
		bron6 = bron6.filter((r) => r.id !== id);
	}
	function bewaarBron6(rij: (typeof bron6)[number], veld: string, waarde: string) {
		(rij as Record<string, unknown>)[veld] = waarde;
		return postIntake({ type: 'bron6.update', id: rij.id, patch: { [veld]: waarde } });
	}

	const bron3Velden = [
		{ key: 'meta_ad_library', label: 'Lang draaiende ad formats (Meta Ad Library)' },
		{ key: 'invalshoeken', label: 'Welke invalshoeken / beloften gebruiken zij?' },
		{ key: 'website_taal', label: 'Opvallende taal op website of landingspagina' },
		{ key: 'tiktok_observaties', label: 'TikTok Creative Center observaties (optioneel)' },
		{ key: 'kansen', label: 'Wat doen zij NIET wat een kans is?' }
	];

	// ---- Document uploaden → intake automatisch invullen ----
	type ParseBron = 'bron1' | 'bron2';
	type Modus = 'aanvullen' | 'overschrijven';
	interface GeparseerdAntwoord {
		vraag_nummer: number;
		antwoord: string;
	}
	interface ConcurrentVoorstel {
		naam: string;
		url: string;
		meta_ad_library: string;
		invalshoeken: string;
		website_taal: string;
		tiktok_observaties: string;
		kansen: string;
	}
	interface ReviewVoorstel {
		platform: string;
		bron_naam: string;
		samenvatting: string;
	}
	interface Voorstel {
		bron1: GeparseerdAntwoord[];
		bron2: GeparseerdAntwoord[];
		bron3: ConcurrentVoorstel[];
		bron4: ReviewVoorstel[];
	}
	const B1 = new Map(BRON1_VRAGEN.map((v) => [v.nummer, v]));
	const B2 = new Map(BRON2_VRAGEN.map((v) => [v.nummer, v]));

	let uploadOpen = $state(false);
	let docTekst = $state('');
	let bestandNaam = $state('');
	let parsing = $state(false);
	let toepassen = $state(false);
	let bestandBezig = $state(false);
	let parseFout = $state<string | null>(null);
	// Bijgevoegd PDF/afbeelding-bestand dat Claude visueel leest (incl. tabellen/grafieken).
	// PDF → ruwe bytes (buf) zodat we kunnen splitsen; afbeelding → base64.
	let bestand = $state<{
		mediaType: string;
		naam: string;
		base64: string | null;
		buf: ArrayBuffer | null;
	} | null>(null);
	let parseStatus = $state('');
	let voorstel = $state<Voorstel | null>(null);
	let gekozen = $state<Set<string>>(new Set());
	// Per al-gevuld Bron 1/2-veld: 'aanvullen' (default) of 'overschrijven'.
	let modus = $state<Record<string, Modus>>({});
	// Reseed-teller: forceert AutoSaveField-velden opnieuw te renderen na toepassen.
	let reseed = $state(0);

	const normTekst = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();
	function aantalVoorstel(v: Voorstel) {
		return v.bron1.length + v.bron2.length + v.bron3.length + v.bron4.length;
	}
	function setModus(s: string, m: Modus) {
		modus = { ...modus, [s]: m };
	}

	function sleutel(bron: ParseBron, nummer: number) {
		return `${bron}:${nummer}`;
	}
	function huidigAntwoord(bron: ParseBron, nummer: number) {
		return bron === 'bron1' ? bron1Antw[nummer] : bron2Antw[nummer];
	}
	function vraagVan(bron: ParseBron, nummer: number) {
		return (bron === 'bron1' ? B1 : B2).get(nummer);
	}

	function openUpload() {
		uploadOpen = true;
	}
	function sluitUpload() {
		uploadOpen = false;
		voorstel = null;
		parseFout = null;
		docTekst = '';
		bestandNaam = '';
		bestand = null;
		gekozen = new Set();
		modus = {};
	}

	function bestandNaarBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const r = new FileReader();
			r.onload = () => {
				const s = String(r.result);
				resolve(s.slice(s.indexOf(',') + 1));
			};
			r.onerror = () => reject(new Error('bestand lezen mislukt'));
			r.readAsDataURL(file);
		});
	}

	async function kiesBestand(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		parseFout = null;
		bestandBezig = true;
		try {
			const naam = file.name.toLowerCase();
			const isPdf = naam.endsWith('.pdf') || file.type === 'application/pdf';
			const isAfbeelding = file.type.startsWith('image/');
			if (isPdf) {
				// PDF → ruwe bytes bewaren zodat we in pagina-batches kunnen splitsen (60s-limiet).
				bestand = {
					mediaType: 'application/pdf',
					naam: file.name,
					base64: null,
					buf: await file.arrayBuffer()
				};
				bestandNaam = file.name;
			} else if (isAfbeelding) {
				// Afbeelding → Claude leest 'm visueel (één call).
				bestand = {
					mediaType: file.type,
					naam: file.name,
					base64: await bestandNaarBase64(file),
					buf: null
				};
				bestandNaam = file.name;
			} else if (naam.endsWith('.xlsx') || naam.endsWith('.xls') || file.type.includes('sheet')) {
				const { excelNaarTekst } = await import('$lib/extract-tekst');
				const tekst = excelNaarTekst(await file.arrayBuffer());
				if (!tekst.trim()) throw new Error('geen tekst in dit Excel-bestand gevonden.');
				docTekst = docTekst.trim() ? docTekst + '\n\n' + tekst : tekst;
				bestandNaam = file.name;
			} else {
				const tekst = await file.text();
				docTekst = docTekst.trim() ? docTekst + '\n\n' + tekst : tekst;
				bestandNaam = file.name;
			}
		} catch (err) {
			parseFout = `Kon "${file.name}" niet lezen: ${err instanceof Error ? err.message : 'onbekende fout'}`;
			bestandNaam = '';
		} finally {
			bestandBezig = false;
			e.currentTarget.value = '';
		}
	}

	/** Eén parse-call → Voorstel (met nette foutmelding). */
	async function postParse(body: Record<string, unknown>): Promise<Voorstel> {
		const res = await fetch('/api/intake', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const ruw = await res.text().catch(() => '');
			let msg = ruw;
			try {
				msg = JSON.parse(ruw).message ?? ruw;
			} catch {
				// ruwe tekst laten staan
			}
			throw new Error(msg || 'Analyse mislukt');
		}
		const d = (await res.json()) as Voorstel;
		return { bron1: d.bron1 ?? [], bron2: d.bron2 ?? [], bron3: d.bron3 ?? [], bron4: d.bron4 ?? [] };
	}

	/** Voegt deel-voorstellen (uit PDF-batches) samen tot één voorstel. */
	function mergeVoorstellen(delen: Voorstel[]): Voorstel {
		const k = (s: string) => s.trim().toLowerCase();
		const b1 = new Map<number, string>();
		const b2 = new Map<number, string>();
		const voeg = (m: Map<number, string>, arr: GeparseerdAntwoord[]) => {
			for (const a of arr) {
				const e = m.get(a.vraag_nummer);
				m.set(a.vraag_nummer, e ? `${e}\n${a.antwoord}` : a.antwoord);
			}
		};
		const b3 = new Map<string, ConcurrentVoorstel>();
		const b4: ReviewVoorstel[] = [];
		for (const d of delen) {
			voeg(b1, d.bron1);
			voeg(b2, d.bron2);
			for (const c of d.bron3) {
				const e = b3.get(k(c.naam));
				if (e) {
					for (const f of [
						'url',
						'meta_ad_library',
						'invalshoeken',
						'website_taal',
						'tiktok_observaties',
						'kansen'
					] as const) {
						if (c[f]?.trim()) e[f] = e[f]?.trim() ? `${e[f]}\n${c[f]}` : c[f];
					}
				} else {
					b3.set(k(c.naam), { ...c });
				}
			}
			for (const r of d.bron4) {
				const e = r.bron_naam ? b4.find((x) => k(x.bron_naam) === k(r.bron_naam)) : undefined;
				if (e) e.samenvatting = `${e.samenvatting}\n\n${r.samenvatting}`;
				else b4.push({ ...r });
			}
		}
		return {
			bron1: [...b1].map(([vraag_nummer, antwoord]) => ({ vraag_nummer, antwoord })),
			bron2: [...b2].map(([vraag_nummer, antwoord]) => ({ vraag_nummer, antwoord })),
			bron3: [...b3.values()],
			bron4: b4
		};
	}

	async function analyseer() {
		parseFout = null;
		if (!bestand && docTekst.trim().length < 20) {
			parseFout = 'Plak eerst tekst, of kies een bestand (PDF, Excel of afbeelding).';
			return;
		}
		parsing = true;
		parseStatus = '';
		const taakId = startTaak('Document analyseren');
		try {
			let data: Voorstel;
			if (bestand?.mediaType === 'application/pdf' && bestand.buf) {
				// Grote PDF's in pagina-batches lezen (elk onder de 60s-timeout) en samenvoegen.
				const { pdfInBatches } = await import('$lib/pdf-split');
				const batches = await pdfInBatches(bestand.buf, 2);
				const delen: Voorstel[] = [];
				for (let i = 0; i < batches.length; i++) {
					if (batches.length > 1) parseStatus = `Pagina's lezen — deel ${i + 1}/${batches.length}…`;
					delen.push(
						await postParse({
							type: 'parse_bestand',
							clientId,
							base64: batches[i],
							mediaType: 'application/pdf'
						})
					);
				}
				data = mergeVoorstellen(delen);
			} else if (bestand?.base64) {
				data = await postParse({
					type: 'parse_bestand',
					clientId,
					base64: bestand.base64,
					mediaType: bestand.mediaType
				});
			} else {
				data = await postParse({ type: 'parse', clientId, tekst: docTekst.trim() });
			}

			voorstel = data;
			// Standaard: alles aangevinkt. Al-gevulde Bron 1/2-velden krijgen modus 'aanvullen'
			// (Bron 3/4 vullen sowieso aan / maken nieuwe rijen).
			const sel = new Set<string>();
			const md: Record<string, Modus> = {};
			for (const a of voorstel.bron1) {
				const s = sleutel('bron1', a.vraag_nummer);
				sel.add(s);
				if (heeftInhoud(huidigAntwoord('bron1', a.vraag_nummer))) md[s] = 'aanvullen';
			}
			for (const a of voorstel.bron2) {
				const s = sleutel('bron2', a.vraag_nummer);
				sel.add(s);
				if (heeftInhoud(huidigAntwoord('bron2', a.vraag_nummer))) md[s] = 'aanvullen';
			}
			voorstel.bron3.forEach((_, i) => sel.add(`bron3:${i}`));
			voorstel.bron4.forEach((_, i) => sel.add(`bron4:${i}`));
			gekozen = sel;
			modus = md;
		} catch (e) {
			parseFout = e instanceof Error ? e.message : 'Analyse mislukt';
		} finally {
			parsing = false;
			parseStatus = '';
			stopTaak(taakId);
		}
	}

	function toggleKeuze(s: string) {
		const next = new Set(gekozen);
		if (next.has(s)) next.delete(s);
		else next.add(s);
		gekozen = next;
	}

	/** Eindwaarde voor een Bron 1/2-veld: aanvullen (samenvoegen) of overschrijven. */
	function eindwaarde(bron: ParseBron, a: GeparseerdAntwoord): string {
		const huidig = huidigAntwoord(bron, a.vraag_nummer) ?? '';
		const m = modus[sleutel(bron, a.vraag_nummer)] ?? 'aanvullen';
		return heeftInhoud(huidig) && m === 'aanvullen' ? `${huidig.trim()}\n${a.antwoord}` : a.antwoord;
	}

	async function pasToe() {
		if (!voorstel) return;
		const b1 = voorstel.bron1.filter((a) => gekozen.has(sleutel('bron1', a.vraag_nummer)));
		const b2 = voorstel.bron2.filter((a) => gekozen.has(sleutel('bron2', a.vraag_nummer)));
		const b3 = voorstel.bron3.filter((_, i) => gekozen.has(`bron3:${i}`));
		const b4 = voorstel.bron4.filter((_, i) => gekozen.has(`bron4:${i}`));
		if (!b1.length && !b2.length && !b3.length && !b4.length) {
			sluitUpload();
			return;
		}
		toepassen = true;
		parseFout = null;
		try {
			// --- Bron 1/2: aanvullen of overschrijven (client berekent de eindwaarde) ---
			if (b1.length) {
				const rows = b1.map((a) => ({ vraag_nummer: a.vraag_nummer, antwoord: eindwaarde('bron1', a) }));
				for (const a of rows) bron1Antw[a.vraag_nummer] = a.antwoord;
				await postIntake({ type: 'bulk', clientId, bron: 'bron1', antwoorden: rows });
			}
			if (b2.length) {
				const rows = b2.map((a) => ({ vraag_nummer: a.vraag_nummer, antwoord: eindwaarde('bron2', a) }));
				for (const a of rows) bron2Antw[a.vraag_nummer] = a.antwoord;
				await postIntake({ type: 'bulk', clientId, bron: 'bron2', antwoorden: rows });
			}

			// --- Bron 3: bestaande concurrent (zelfde naam) aanvullen, anders nieuwe rij ---
			for (const c of b3) {
				const bestaand = bron3.find((r) => normTekst(r.naam) === normTekst(c.naam) && normTekst(c.naam) !== '');
				if (bestaand) {
					const patch: Record<string, string> = {};
					for (const k of [
						'url',
						'meta_ad_library',
						'invalshoeken',
						'website_taal',
						'tiktok_observaties',
						'kansen'
					] as const) {
						const nieuw = c[k]?.trim();
						if (!nieuw) continue;
						const huidig = ((bestaand as Record<string, string | null>)[k] ?? '').trim();
						const waarde = huidig ? `${huidig}\n${nieuw}` : nieuw;
						patch[k] = waarde;
						(bestaand as Record<string, unknown>)[k] = waarde;
					}
					if (Object.keys(patch).length) {
						await postIntake({ type: 'bron3.update', id: bestaand.id, patch });
						scanKey[bestaand.id] = (scanKey[bestaand.id] ?? 0) + 1;
					}
				} else {
					const { rij } = await postIntake<{ rij: (typeof bron3)[number] }>({
						type: 'bron3.insert',
						clientId,
						velden: {
							naam: c.naam,
							url: c.url,
							meta_ad_library: c.meta_ad_library,
							invalshoeken: c.invalshoeken,
							website_taal: c.website_taal,
							tiktok_observaties: c.tiktok_observaties,
							kansen: c.kansen
						}
					});
					bron3.push(rij);
				}
			}

			// --- Bron 4: bestaande bron (zelfde bron_naam) aanvullen, anders nieuwe rij ---
			for (const r of b4) {
				const bestaand = r.bron_naam
					? bron4.find((x) => normTekst(x.bron_naam) === normTekst(r.bron_naam))
					: undefined;
				if (bestaand) {
					const huidig = (bestaand.ruwe_tekst ?? '').trim();
					const waarde = huidig ? `${huidig}\n\n${r.samenvatting}` : r.samenvatting;
					bestaand.ruwe_tekst = waarde;
					await postIntake({ type: 'bron4.update', id: bestaand.id, patch: { ruwe_tekst: waarde } });
					scanKey[bestaand.id] = (scanKey[bestaand.id] ?? 0) + 1;
				} else {
					const { rij } = await postIntake<{ rij: (typeof bron4)[number] }>({
						type: 'bron4.insert',
						clientId,
						velden: { platform: r.platform, bron_naam: r.bron_naam, ruwe_tekst: r.samenvatting }
					});
					bron4.push(rij);
				}
			}

			reseed++;
			actief = b1.length ? 'bron1' : b2.length ? 'bron2' : b3.length ? 'bron3' : 'bron4';
			sluitUpload();
		} catch (e) {
			parseFout = e instanceof Error ? e.message : 'Opslaan mislukt';
		} finally {
			toepassen = false;
		}
	}
</script>

<!-- Auto-save statusbalk -->
<div class="mb-4 flex items-center justify-between gap-4">
	<p class="text-sm text-muted-foreground">
		Alles wordt automatisch opgeslagen. Niet elke bron hoeft ingevuld te zijn.
	</p>
	<div class="flex items-center gap-3">
		<div class="flex items-center gap-1.5 text-xs">
			{#if saver.fout}
				<TriangleAlert class="size-3.5 text-destructive" />
				<span class="text-destructive">Opslaan mislukt</span>
			{:else if saver.actief > 0}
				<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" />
				<span class="text-muted-foreground">Opslaan…</span>
			{:else if saver.laatstOpgeslagen}
				<Check class="size-3.5 text-brand-green" />
				<span class="text-muted-foreground">Alle wijzigingen opgeslagen</span>
			{/if}
		</div>
		<div
			data-tour-order="2"
			data-tour-title="Document uploaden"
			data-tour-text="Upload een klantgesprek, reviews-uitdraai of concurrentie-analyse (PDF, Excel, afbeelding of tekst). De AI leest het — ook grafieken en tabellen — en verdeelt de inhoud automatisch over de juiste bronnen. Bestaande velden worden aangevuld."
		>
			<Button variant="outline" size="sm" onclick={openUpload}>
				<Upload class="size-4" />
				Document uploaden
			</Button>
		</div>
	</div>
</div>

<!-- Bron-tabs -->
<div
	class="flex flex-wrap gap-2"
	data-tour-order="1"
	data-tour-title="Intake — de basis"
	data-tour-text="Hier verzamel je alles over de klant, verdeeld over 6 bronnen (klantgesprek, interne interviews, concurrentie, reviews, eigen data, overig). Hoe vollediger de intake, hoe sterker alles wat de tool daarna maakt."
>
	{#each tabs as t (t.key)}
		<button
			type="button"
			onclick={() => (actief = t.key)}
			class={cn(
				'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
				actief === t.key
					? 'border-primary bg-primary/5 text-primary'
					: 'border-border text-muted-foreground hover:bg-muted'
			)}
		>
			{t.label}
			{#if 'count' in t}
				<span class="rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
					{t.count}
				</span>
			{:else}
				<span
					class={cn(
						'rounded-full px-1.5 py-0.5 text-xs font-semibold',
						t.pct >= 100
							? 'bg-brand-lime/25 text-brand-green'
							: t.pct > 0
								? 'bg-muted text-foreground'
								: 'bg-muted text-muted-foreground'
					)}
				>
					{t.pct}%
				</span>
			{/if}
		</button>
	{/each}
</div>

<div class="mt-6">
	<!-- ============ BRON 1 ============ -->
	{#if actief === 'bron1'}
		<div class="space-y-6">
			{#key reseed}
				{#each BRON1_VRAGEN as v, i (v.nummer)}
					{#if i === 0 || BRON1_VRAGEN[i - 1].categorie !== v.categorie}
						<h3 class="border-b pb-1 text-sm font-semibold uppercase tracking-wide text-brand-green">
							{v.categorie}
						</h3>
					{/if}
					<div class="space-y-2">
						<Label for={`b1-${v.nummer}`}>{v.tekst}</Label>
						<AutoSaveField
							id={`b1-${v.nummer}`}
							value={bron1Antw[v.nummer] ?? ''}
							onsave={(w) => bewaarBron1(v.nummer, w)}
							placeholder="Antwoord…"
						/>
					</div>
				{/each}
			{/key}
		</div>
	{/if}

	<!-- ============ BRON 2 ============ -->
	{#if actief === 'bron2'}
		<div class="space-y-6">
			<label
				class="flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
			>
				<input
					type="checkbox"
					checked={bron2Nvt}
					onchange={toggleNvt}
					class="size-4 accent-[var(--brand-green)]"
				/>
				Niet beschikbaar — deze klant heeft geen klantenservice/sales om te interviewen
			</label>

			{#if bron2Nvt}
				<p class="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
					Deze bron is gemarkeerd als niet beschikbaar en telt als afgehandeld.
				</p>
			{:else}
				{#key reseed}
					{#each BRON2_VRAGEN as v, i (v.nummer)}
						{#if i === 0 || BRON2_VRAGEN[i - 1].categorie !== v.categorie}
							<h3 class="border-b pb-1 text-sm font-semibold uppercase tracking-wide text-brand-green">
								{v.categorie}
							</h3>
						{/if}
						<div class="space-y-2">
							<Label for={`b2-${v.nummer}`}>{v.tekst}</Label>
							<AutoSaveField
								id={`b2-${v.nummer}`}
								value={bron2Antw[v.nummer] ?? ''}
								onsave={(w) => bewaarBron2(v.nummer, w)}
								placeholder="Antwoord…"
							/>
						</div>
					{/each}
				{/key}
			{/if}
		</div>
	{/if}

	<!-- ============ BRON 3 ============ -->
	{#if actief === 'bron3'}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Voeg 3 tot 10 concurrenten toe. ({bron3.length} toegevoegd)
			</p>

			{#if scanFout}
				<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{scanFout}
				</div>
			{/if}

			{#each bron3 as c, i (c.id)}
				<div class="rounded-lg border p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="text-sm font-semibold">Concurrent {i + 1}</span>
						<Button variant="ghost" size="sm" onclick={() => verwijderConcurrent(c.id)}>
							<Trash2 class="size-4" />
						</Button>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div class="space-y-1.5">
							<Label>Naam</Label>
							<AutoSaveField
								multiline={false}
								value={c.naam ?? ''}
								onsave={(w) => bewaarConcurrent(c, 'naam', w)}
								placeholder="Naam concurrent"
							/>
						</div>
						<div class="space-y-1.5">
							<Label>URL</Label>
							<AutoSaveField
								multiline={false}
								value={c.url ?? ''}
								onsave={(w) => bewaarConcurrent(c, 'url', w)}
								placeholder="https://…"
							/>
						</div>
					</div>
					<div class="mt-3">
						<Button
							variant="outline"
							size="sm"
							onclick={() => scanConcurrent(c)}
							disabled={scanBezig[c.id] || !c.url?.trim()}
						>
							{#if scanBezig[c.id]}
								<LoaderCircle class="size-4 animate-spin" />
								Scannen…
							{:else}
								<Sparkles class="size-4" />
								Scan website (AI)
							{/if}
						</Button>
						<p class="mt-1 text-xs text-muted-foreground">
							Haalt de website op en vult invalshoeken, taal en kansen in als voorstel — controleer en
							pas aan.
						</p>
					</div>
					{#key scanKey[c.id] ?? 0}
						<div class="mt-3 space-y-3">
							{#each bron3Velden as veld (veld.key)}
								<div class="space-y-1.5">
									<Label>{veld.label}</Label>
									<AutoSaveField
										rows={2}
										value={(c as Record<string, string | null>)[veld.key] ?? ''}
										onsave={(w) => bewaarConcurrent(c, veld.key, w)}
									/>
								</div>
							{/each}
						</div>
					{/key}
				</div>
			{/each}

			<Button variant="outline" onclick={voegConcurrentToe} disabled={bron3.length >= 10}>
				<Plus class="size-4" />
				Concurrent toevoegen
			</Button>
		</div>
	{/if}

	<!-- ============ BRON 4 ============ -->
	{#if actief === 'bron4'}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Plak per bron een <strong>samenvatting</strong> van wat er uit de reviews komt (van jezelf én
				concurrenten): de terugkerende positieve punten, negatieve punten en de gaps/kansen die je
				daaruit kunt benutten. Nog geen samenvatting? Plak dan de ruwe reviews/comments.
			</p>

			{#if scanFout}
				<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{scanFout}
				</div>
			{/if}

			{#each bron4 as r, i (r.id)}
				<div class="rounded-lg border p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="text-sm font-semibold">Bron {i + 1}</span>
						<Button variant="ghost" size="sm" onclick={() => verwijderBron4(r.id)}>
							<Trash2 class="size-4" />
						</Button>
					</div>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div class="space-y-1.5">
							<Label>Platform</Label>
							<select
								value={r.platform ?? ''}
								onchange={(e) => bewaarBron4(r, 'platform', e.currentTarget.value)}
								class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
							>
								<option value="" disabled>Kies platform…</option>
								{#each BRON4_PLATFORMS as p (p)}
									<option value={p}>{p}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-1.5">
							<Label>Naam van de bron</Label>
							<AutoSaveField
								multiline={false}
								value={r.bron_naam ?? ''}
								onsave={(w) => bewaarBron4(r, 'bron_naam', w)}
								placeholder="Bijv. Trustpilot Equalité"
							/>
						</div>
					</div>
					<div class="mt-3 space-y-1.5">
						<Label>Reviews automatisch samenvatten (optioneel)</Label>
						<div class="flex flex-wrap items-center gap-2">
							<Input
								class="max-w-md flex-1"
								placeholder="https://… (Trustpilot / Kiyoh / Google-reviewpagina)"
								bind:value={reviewUrl[r.id]}
							/>
							<Button
								variant="outline"
								size="sm"
								onclick={() => scanReviewBron(r)}
								disabled={scanBezig[r.id] || !(reviewUrl[r.id] ?? '').trim()}
							>
								{#if scanBezig[r.id]}
									<LoaderCircle class="size-4 animate-spin" />
									Scannen…
								{:else}
									<Sparkles class="size-4" />
									Scan reviews (AI)
								{/if}
							</Button>
						</div>
					</div>
					{#key scanKey[r.id] ?? 0}
						<div class="mt-3 space-y-1.5">
							<Label>Samenvatting (positief · negatief · gaps)</Label>
							<AutoSaveField
								rows={5}
								value={r.ruwe_tekst ?? ''}
								onsave={(w) => bewaarBron4(r, 'ruwe_tekst', w)}
								placeholder={'Positief: terugkerende complimenten…\nNegatief: klachten/frustraties…\nGaps/kansen: wat concurrenten laten liggen…'}
							/>
						</div>
					{/key}
				</div>
			{/each}

			<Button variant="outline" onclick={voegBron4Toe}>
				<Plus class="size-4" />
				Bron toevoegen
			</Button>
		</div>
	{/if}

	<!-- ============ BRON 5 ============ -->
	{#if actief === 'bron5'}
		<div class="space-y-5">
			{#each BRON5_VELDEN as veld (veld.key)}
				<div class="space-y-1.5">
					<Label for={`b5-${veld.key}`}>{veld.label}</Label>
					<p class="text-xs text-muted-foreground">{veld.hint}</p>
					<AutoSaveField
						id={`b5-${veld.key}`}
						rows={4}
						value={bron5[veld.key]}
						onsave={(w) => bewaarBron5(veld.key, w)}
					/>
				</div>
			{/each}
		</div>
	{/if}

	<!-- ============ BRON 6 — Overig ============ -->
	{#if actief === 'bron6'}
		<div class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Optionele extra data die niet in de andere bronnen past — bijv. Pinterest-inzichten,
				Reddit-discussies of analyses van eerdere campagnes. Voeg zoveel blokken toe als je wilt; geen
				is ook prima. Deze data wordt meegenomen bij het genereren van de trigger map.
			</p>

			{#each bron6 as r (r.id)}
				<div class="rounded-lg border p-4">
					<div class="mb-3 flex items-start gap-2">
						<div class="flex-1">
							<AutoSaveField
								multiline={false}
								value={r.titel ?? ''}
								onsave={(w) => bewaarBron6(r, 'titel', w)}
								placeholder="Titel (bijv. 'Pinterest-analyse Q2' of 'Learnings campagne 2025')"
							/>
						</div>
						<Button variant="ghost" size="sm" onclick={() => verwijderBron6(r.id)}>
							<Trash2 class="size-4" />
						</Button>
					</div>
					<AutoSaveField
						rows={5}
						value={r.inhoud ?? ''}
						onsave={(w) => bewaarBron6(r, 'inhoud', w)}
						placeholder="Plak of typ hier de data, inzichten of bevindingen…"
					/>
				</div>
			{/each}

			<Button variant="outline" onclick={voegBron6Toe}>
				<Plus class="size-4" />
				Blok toevoegen
			</Button>
		</div>
	{/if}
</div>

<!-- ============ Document uploaden-modal ============ -->
{#snippet regel(bron: ParseBron, a: GeparseerdAntwoord)}
	{@const v = vraagVan(bron, a.vraag_nummer)}
	{@const huidig = huidigAntwoord(bron, a.vraag_nummer)}
	{@const gevuld = heeftInhoud(huidig)}
	{@const s = sleutel(bron, a.vraag_nummer)}
	<div
		class={cn(
			'rounded-lg border p-3 text-sm transition-colors',
			gekozen.has(s) ? 'border-primary bg-primary/5' : 'border-border'
		)}
	>
		<label class="flex cursor-pointer gap-3">
			<input
				type="checkbox"
				checked={gekozen.has(s)}
				onchange={() => toggleKeuze(s)}
				class="mt-0.5 size-4 shrink-0 accent-[var(--brand-green)]"
			/>
			<div class="min-w-0 space-y-1">
				<div class="flex flex-wrap items-center gap-1.5">
					{#if v?.categorie}
						<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{v.categorie}</span>
					{/if}
					{#if gevuld}
						<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
							veld al ingevuld
						</span>
					{/if}
				</div>
				<p class="font-medium text-foreground">{v?.tekst ?? `Vraag ${a.vraag_nummer}`}</p>
				<p class="whitespace-pre-wrap text-foreground">{a.antwoord}</p>
				{#if gevuld}
					<p class="whitespace-pre-wrap text-xs text-muted-foreground">Huidig: {huidig}</p>
				{/if}
			</div>
		</label>
		{#if gevuld && gekozen.has(s)}
			<div class="mt-2 flex gap-1.5 pl-7">
				<button
					type="button"
					onclick={() => setModus(s, 'aanvullen')}
					class={cn(
						'rounded-md border px-2 py-0.5 text-xs',
						(modus[s] ?? 'aanvullen') === 'aanvullen'
							? 'border-brand-green bg-brand-mint/50 font-medium text-brand-green'
							: 'border-border text-muted-foreground hover:bg-muted'
					)}
				>
					Aanvullen
				</button>
				<button
					type="button"
					onclick={() => setModus(s, 'overschrijven')}
					class={cn(
						'rounded-md border px-2 py-0.5 text-xs',
						modus[s] === 'overschrijven'
							? 'border-brand-green bg-brand-mint/50 font-medium text-brand-green'
							: 'border-border text-muted-foreground hover:bg-muted'
					)}
				>
					Overschrijven
				</button>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet regelConcurrent(c: ConcurrentVoorstel, i: number)}
	{@const s = `bron3:${i}`}
	{@const bestaat = bron3.some((r) => normTekst(r.naam) === normTekst(c.naam) && normTekst(c.naam) !== '')}
	<label
		class={cn(
			'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors',
			gekozen.has(s) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
		)}
	>
		<input
			type="checkbox"
			checked={gekozen.has(s)}
			onchange={() => toggleKeuze(s)}
			class="mt-0.5 size-4 shrink-0 accent-[var(--brand-green)]"
		/>
		<div class="min-w-0 space-y-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Concurrent</span>
				{#if bestaat}
					<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
						bestaat al → aanvullen
					</span>
				{/if}
			</div>
			<p class="font-medium text-foreground">
				{c.naam}{#if c.url}<span class="font-normal text-muted-foreground"> · {c.url}</span>{/if}
			</p>
			{#if c.meta_ad_library}
				<p class="whitespace-pre-wrap"><span class="text-muted-foreground">Ad Library:</span> {c.meta_ad_library}</p>
			{/if}
			{#if c.invalshoeken}
				<p class="whitespace-pre-wrap"><span class="text-muted-foreground">Invalshoeken:</span> {c.invalshoeken}</p>
			{/if}
			{#if c.website_taal}
				<p class="whitespace-pre-wrap"><span class="text-muted-foreground">Taal:</span> {c.website_taal}</p>
			{/if}
			{#if c.tiktok_observaties}
				<p class="whitespace-pre-wrap"><span class="text-muted-foreground">TikTok:</span> {c.tiktok_observaties}</p>
			{/if}
			{#if c.kansen}
				<p class="whitespace-pre-wrap"><span class="text-muted-foreground">Kansen:</span> {c.kansen}</p>
			{/if}
		</div>
	</label>
{/snippet}

{#snippet regelReview(r: ReviewVoorstel, i: number)}
	{@const s = `bron4:${i}`}
	{@const bestaat = !!r.bron_naam && bron4.some((x) => normTekst(x.bron_naam) === normTekst(r.bron_naam))}
	<label
		class={cn(
			'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors',
			gekozen.has(s) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
		)}
	>
		<input
			type="checkbox"
			checked={gekozen.has(s)}
			onchange={() => toggleKeuze(s)}
			class="mt-0.5 size-4 shrink-0 accent-[var(--brand-green)]"
		/>
		<div class="min-w-0 space-y-1">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Review</span>
				{#if r.platform}
					<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{r.platform}</span>
				{/if}
				{#if bestaat}
					<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
						bestaat al → aanvullen
					</span>
				{/if}
			</div>
			{#if r.bron_naam}<p class="font-medium text-foreground">{r.bron_naam}</p>{/if}
			<p class="whitespace-pre-wrap text-foreground">{r.samenvatting}</p>
		</div>
	</label>
{/snippet}

{#if uploadOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="button"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget && !parsing && !toepassen) sluitUpload();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !parsing && !toepassen) sluitUpload();
		}}
	>
		<div class="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-5 py-3.5">
				<h2 class="flex items-center gap-2 text-base font-semibold">
					<Upload class="size-4 text-brand-green" />
					Document uploaden
				</h2>
				<button
					type="button"
					onclick={sluitUpload}
					disabled={parsing || toepassen}
					class="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
					aria-label="Sluiten"
				>
					<X class="size-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-5 py-4">
				{#if !voorstel}
					<p class="mb-3 text-sm text-muted-foreground">
						Plak hieronder de tekst van een klantgesprek, reviews-uitdraai, concurrentie-analyse of ander
						intake-document, of upload een bestand: <strong>PDF</strong>, <strong>Excel</strong>
						(<code>.xlsx</code>) of tekst (<code>.txt</code>/<code>.md</code>/<code>.csv</code>). Claude leest
						het en verdeelt de inhoud over de juiste bronnen (klantgesprek, interne interviews, concurrentie,
						reviews) — jij bepaalt wat je overneemt.
					</p>

					<Textarea
						rows={10}
						bind:value={docTekst}
						placeholder="Plak hier de inhoud van het document…"
					/>

					<div class="mt-3 flex flex-wrap items-center gap-3">
						<label
							class="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
						>
							{#if bestandBezig}
								<LoaderCircle class="size-4 animate-spin" />
							{:else}
								<Upload class="size-4" />
							{/if}
							Bestand kiezen (PDF, Excel, afbeelding, tekst)
							<input
								type="file"
								accept=".txt,.md,.markdown,.csv,.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.gif,text/plain,application/pdf,image/*"
								onchange={kiesBestand}
								class="hidden"
							/>
						</label>
						{#if bestand}
							<span class="inline-flex items-center gap-1.5 rounded-md bg-brand-mint/60 px-2 py-1 text-xs text-brand-green">
								{bestand.naam} — wordt visueel gelezen
								<button
									type="button"
									class="text-brand-green/70 hover:text-brand-green"
									title="Verwijderen"
									onclick={() => {
										bestand = null;
										bestandNaam = '';
									}}
								>
									<X class="size-3.5" />
								</button>
							</span>
						{:else if bestandNaam}
							<span class="truncate text-xs text-muted-foreground">{bestandNaam}</span>
						{/if}
						{#if !bestand}
							<span class="ml-auto text-xs text-muted-foreground">
								{docTekst.trim().length.toLocaleString('nl-NL')} tekens
							</span>
						{/if}
					</div>

					{#if parseFout}
						<p class="mt-3 flex items-center gap-1.5 text-sm text-destructive">
							<TriangleAlert class="size-4" />
							{parseFout}
						</p>
					{/if}
				{:else if aantalVoorstel(voorstel) === 0}
					<p class="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
						Geen bruikbare informatie gevonden in dit document. Probeer meer of andere tekst.
					</p>
				{:else}
					<p class="mb-3 text-sm text-muted-foreground">
						Claude vond {aantalVoorstel(voorstel)} voorstellen en verdeelde ze over de juiste bronnen. Vink
						aan wat je wilt overnemen. Al ingevulde Bron 1/2-velden staan op <strong>aanvullen</strong> —
						zet op overschrijven als je ze wilt vervangen.
					</p>
					{#if voorstel.bron1.length}
						<h3 class="mb-2 text-sm font-semibold text-brand-green">Klantgesprek (Bron 1)</h3>
						<div class="mb-4 space-y-2">
							{#each voorstel.bron1 as a (a.vraag_nummer)}
								{@render regel('bron1', a)}
							{/each}
						</div>
					{/if}
					{#if voorstel.bron2.length}
						<h3 class="mb-2 text-sm font-semibold text-brand-green">Interne interviews (Bron 2)</h3>
						<div class="mb-4 space-y-2">
							{#each voorstel.bron2 as a (a.vraag_nummer)}
								{@render regel('bron2', a)}
							{/each}
						</div>
					{/if}
					{#if voorstel.bron3.length}
						<h3 class="mb-2 text-sm font-semibold text-brand-green">Concurrentie (Bron 3)</h3>
						<div class="mb-4 space-y-2">
							{#each voorstel.bron3 as c, i (i)}
								{@render regelConcurrent(c, i)}
							{/each}
						</div>
					{/if}
					{#if voorstel.bron4.length}
						<h3 class="mb-2 text-sm font-semibold text-brand-green">Reviews (Bron 4)</h3>
						<div class="space-y-2">
							{#each voorstel.bron4 as r, i (i)}
								{@render regelReview(r, i)}
							{/each}
						</div>
					{/if}
					{#if parseFout}
						<p class="mt-3 flex items-center gap-1.5 text-sm text-destructive">
							<TriangleAlert class="size-4" />
							{parseFout}
						</p>
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between gap-3 border-t px-5 py-3.5">
				{#if voorstel && aantalVoorstel(voorstel) > 0}
					<span class="text-xs text-muted-foreground">{gekozen.size} geselecteerd</span>
					<div class="flex gap-2">
						<Button variant="ghost" onclick={() => (voorstel = null)} disabled={toepassen}>
							Terug
						</Button>
						<Button onclick={pasToe} disabled={toepassen || gekozen.size === 0}>
							{#if toepassen}
								<LoaderCircle class="size-4 animate-spin" />
								Toepassen…
							{:else}
								Overnemen ({gekozen.size})
							{/if}
						</Button>
					</div>
				{:else}
					<span class="truncate text-xs text-muted-foreground">{parsing ? parseStatus : ''}</span>
					<div class="flex gap-2">
						<Button variant="ghost" onclick={sluitUpload} disabled={parsing}>Annuleren</Button>
						<Button onclick={analyseer} disabled={parsing || (!bestand && docTekst.trim().length < 20)}>
							{#if parsing}
								<LoaderCircle class="size-4 animate-spin" />
								Analyseren…
							{:else}
								<Sparkles class="size-4" />
								Analyseren
							{/if}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
