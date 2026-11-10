<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import { Input } from '$lib/components/ui/input';
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR, BEWUSTZIJN_FASEN, bewustzijnVan } from '$lib/trigger-map';
	import { saver, postJSON } from '$lib/saver.svelte';
	import type { Concept } from '$lib/supabase/database.types';
	import { SCRIPT_BEATS, ADVERTENTIE_VELDEN, normAdvertentie, type Script, type Advertentie, type ScriptBeat } from '$lib/productie';
	import { splitsRonde } from '$lib/testbord';
	import { briefSecties, briefNaarMarkdown, type Brief } from '$lib/sprint';
	import { page } from '$app/state';
	import AdMockup from '$lib/components/app/AdMockup.svelte';
	import StoryboardBlad from '$lib/components/app/StoryboardBlad.svelte';
	import FileStack from '@lucide/svelte/icons/files';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LinkIcon from '@lucide/svelte/icons/link';
	import Package from '@lucide/svelte/icons/package';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import X from '@lucide/svelte/icons/x';

	let { data } = $props();
	const client = $derived(data.client);
	const base = $derived(`/klanten/${client.id}`);

	type Beeld = Partial<Record<ScriptBeat, string>>;
	type ScriptMetBeeld = Script & { beeld: Beeld };

	// Houdt ook de beeldaanwijzingen van het storyboard vast: anders zouden die bij het opslaan van het script verdwijnen.
	function normScript(v: unknown): ScriptMetBeeld {
		const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
		const b = s.beeld && typeof s.beeld === 'object' ? (s.beeld as Record<string, unknown>) : {};
		const beeld: Beeld = {};
		for (const k of SCRIPT_BEATS) if (b[k.key] != null && String(b[k.key]).trim()) beeld[k.key] = String(b[k.key]);
		return {
			hook: String(s.hook ?? ''),
			probleem: String(s.probleem ?? ''),
			oplossing: String(s.oplossing ?? ''),
			resultaat: String(s.resultaat ?? ''),
			cta: String(s.cta ?? ''),
			advertentie: normAdvertentie(s.advertentie),
			beeld
		};
	}
	type Rij = Concept & { _script: ScriptMetBeeld; ronde?: number | null };

	const naarRijen = (rijen: Concept[]): Rij[] => rijen.map((c) => ({ ...c, _script: normScript(c.script) }));
	// svelte-ignore state_referenced_locally
	let concepten = $state<Rij[]>(naarRijen(data.concepten));
	$effect(() => {
		concepten = naarRijen(data.concepten);
	});

	// ---- Wat is er klaar per concept? ----
	const STAPPEN = [
		{ key: 'brief', label: 'Brief' },
		{ key: 'script', label: 'Script' },
		{ key: 'tekst', label: 'Advertentietekst' },
		{ key: 'beeld', label: 'Beeld' }
	] as const;
	type StapKey = (typeof STAPPEN)[number]['key'];

	const heeftBrief = (c: Rij) => !!c.brief && typeof c.brief === 'object' && Object.values(c.brief as Record<string, unknown>).some((v) => typeof v === 'string' && v.trim());
	const heeftScript = (c: Rij) => SCRIPT_BEATS.some((b) => c._script[b.key].trim());
	const heeftTekst = (c: Rij) => !!c._script.advertentie?.primair.trim();
	const heeftBeeld = (c: Rij) => SCRIPT_BEATS.some((b) => (c._script.beeld[b.key] ?? '').trim());
	const gedaan = (c: Rij): Record<StapKey, boolean> => ({
		brief: heeftBrief(c),
		script: heeftScript(c),
		tekst: heeftTekst(c),
		beeld: heeftBeeld(c)
	});
	const aantalKlaar = (c: Rij) => Object.values(gedaan(c)).filter(Boolean).length;

	// ---- Rondes en lijst ----
	const ronde = $derived(splitsRonde(concepten));
	const volgorde = [...BEWUSTZIJN_FASEN].reverse(); // bottom-up: Meest bewust eerst
	const groepen = $derived(
		volgorde
			.map((f) => ({ fase: f.label, items: ronde.actueel.filter((c) => bewustzijnVan(c) === f.label) }))
			.filter((g) => g.items.length > 0)
	);
	const totaal = $derived(ronde.actueel.length);
	const klaarAantal = $derived(ronde.actueel.filter((c) => aantalKlaar(c) === STAPPEN.length).length);

	// ---- Gekozen concept en stap ----
	// svelte-ignore state_referenced_locally
	let gekozenId = $state<string | null>(page.url.searchParams.get('c'));
	const gekozen = $derived(concepten.find((c) => c.id === gekozenId) ?? groepen[0]?.items[0] ?? concepten[0] ?? null);
	let stapKeuze = $state<Record<string, StapKey>>({});
	const eerstOpenStap = (c: Rij): StapKey => STAPPEN.find((s) => !gedaan(c)[s.key])?.key ?? 'brief';
	const stap = $derived<StapKey>(gekozen ? (stapKeuze[gekozen.id] ?? eerstOpenStap(gekozen)) : 'brief');

	// ---- AI-acties (geven true terug als het gelukt is) ----
	let bezig = $state<Record<string, boolean>>({});
	let fout = $state<string | null>(null);
	let gekopieerd = $state<Record<string, boolean>>({});

	function leesFout(e: unknown, standaard: string): string {
		const ruw = e instanceof Error ? e.message : standaard;
		try {
			const j = JSON.parse(ruw);
			if (j?.message) return String(j.message);
		} catch {
			// geen JSON
		}
		return ruw;
	}

	async function genBrief(c: Rij): Promise<boolean> {
		bezig[c.id + 'brief'] = true;
		fout = null;
		try {
			const { brief: b } = await postJSON<{ brief: Brief }>('/api/sprint', { type: 'brief', id: c.id }, { taak: 'Brief genereren', ververs: true });
			c.brief = b as unknown as Rij['brief'];
			return true;
		} catch (e) {
			fout = leesFout(e, 'Brief genereren mislukt');
			return false;
		} finally {
			bezig[c.id + 'brief'] = false;
		}
	}
	async function genScript(c: Rij): Promise<boolean> {
		bezig[c.id + 'script'] = true;
		fout = null;
		try {
			const { script } = await postJSON<{ script: Script }>('/api/concepts', { type: 'script_gen', id: c.id }, { taak: 'Script genereren' });
			const nieuw = normScript(script);
			c._script = { ...nieuw, beeld: c._script.beeld }; // het storyboard blijft staan
			return true;
		} catch (e) {
			fout = leesFout(e, 'Script genereren mislukt');
			return false;
		} finally {
			bezig[c.id + 'script'] = false;
		}
	}
	async function genAd(c: Rij): Promise<boolean> {
		bezig[c.id + 'tekst'] = true;
		fout = null;
		try {
			const { advertentie } = await postJSON<{ advertentie: Advertentie }>('/api/concepts', { type: 'advertentie_gen', id: c.id }, { taak: 'Advertentietekst schrijven' });
			c._script.advertentie = normAdvertentie(advertentie);
			return true;
		} catch (e) {
			fout = leesFout(e, 'Advertentietekst schrijven mislukt');
			return false;
		} finally {
			bezig[c.id + 'tekst'] = false;
		}
	}
	async function genBeeld(c: Rij): Promise<boolean> {
		bezig[c.id + 'beeld'] = true;
		fout = null;
		try {
			const { beeld } = await postJSON<{ beeld: Beeld }>('/api/concepts', { type: 'beeld_gen', id: c.id }, { taak: 'Beeldaanwijzing maken' });
			c._script.beeld = { ...beeld };
			return true;
		} catch (e) {
			fout = leesFout(e, 'Beeldaanwijzing maken mislukt');
			return false;
		} finally {
			bezig[c.id + 'beeld'] = false;
		}
	}

	/** Maakt alles wat er nog ontbreekt bij één concept, in de goede volgorde. Stopt bij de eerste fout. */
	async function maakAlles(c: Rij): Promise<boolean> {
		const d = gedaan(c);
		if (!d.brief && !(await genBrief(c))) return false;
		if (!d.script && !(await genScript(c))) return false;
		if (!d.tekst && !(await genAd(c))) return false;
		if (!d.beeld && !(await genBeeld(c))) return false;
		return true;
	}

	// ---- Alles voor alle concepten van deze ronde ----
	let bulk = $state<{ nu: number; van: number; naam: string } | null>(null);
	let stopBulk = false;
	async function maakAllesVoorAlle() {
		const open = ronde.actueel.filter((c) => aantalKlaar(c) < STAPPEN.length);
		if (open.length === 0) return;
		const ontbrekend = open.reduce((n, c) => n + (STAPPEN.length - aantalKlaar(c)), 0);
		if (!confirm(`Dit laat de AI ${ontbrekend} onderdelen schrijven voor ${open.length} concepten. Dat duurt enkele minuten en kost AI-tegoed. Blijf op deze pagina tot het klaar is. Doorgaan?`)) return;
		stopBulk = false;
		for (let i = 0; i < open.length; i++) {
			if (stopBulk) break;
			bulk = { nu: i + 1, van: open.length, naam: open[i].invalshoek || '(geen invalshoek)' };
			if (!(await maakAlles(open[i]))) break;
		}
		bulk = null;
	}

	// ---- Handmatig opslaan ----
	function saveVeld(c: Rij, veld: 'referentie' | 'props') {
		return postJSON('/api/concepts', { type: 'update', id: c.id, patch: { [veld]: c[veld] } });
	}
	function saveScript(c: Rij) {
		return postJSON('/api/concepts', { type: 'script_save', id: c.id, script: c._script });
	}

	// ---- Brief kopiëren / exporteren ----
	const briefVan = (c: Rij): Brief | null => (c.brief as Brief | null) ?? null;
	async function kopieerBrief(c: Rij) {
		const b = briefVan(c);
		if (!b) return;
		try {
			await navigator.clipboard.writeText(briefNaarMarkdown(b, c.invalshoek || 'concept', c.format));
			gekopieerd[c.id] = true;
			setTimeout(() => (gekopieerd[c.id] = false), 2000);
		} catch {
			fout = 'Kopiëren naar klembord mislukt.';
		}
	}
	function exporteerBrief(c: Rij) {
		const b = briefVan(c);
		if (!b) return;
		const md = briefNaarMarkdown(b, c.invalshoek || 'concept', c.format);
		const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
		const naam = 'brief-' + (c.invalshoek || 'concept').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${naam || 'brief'}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const dims = (c: Rij) => [c.aanbod, c.format, c.creator_type].filter(Boolean).join(' · ');
	const eyebrow = 'text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground';
	const knop =
		'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors disabled:opacity-60';
</script>

<div class="space-y-5 pb-16">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div
			data-tour-order="1"
			data-tour-title="Creatie"
			data-tour-text="Links zie je alle concepten van de ronde met vier vinkjes: brief, script, advertentietekst en beeld. Kies een concept en loop de stappen langs, of laat de AI alles maken wat er nog ontbreekt."
		>
			<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Maken</p>
			<h1 class="font-display text-3xl font-bold text-brand-green">Creatie</h1>
			<p class="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
				<span><span class="font-semibold text-foreground">{klaarAantal}</span> van {totaal} concepten klaar</span>
				<span class="h-2 w-28 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-brand-green" style="width:{totaal ? (klaarAantal / totaal) * 100 : 0}%"></span></span>
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<div class="flex items-center gap-1.5 text-xs">
				{#if saver.fout}
					<TriangleAlert class="size-3.5 text-destructive" /><span class="text-destructive">Opslaan mislukt</span>
				{:else if saver.actief > 0}
					<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" /><span class="text-muted-foreground">Opslaan…</span>
				{:else if saver.laatstOpgeslagen}
					<Check class="size-3.5 text-brand-green" /><span class="text-muted-foreground">Opgeslagen</span>
				{/if}
			</div>
			{#if totaal > klaarAantal}
				<button type="button" class={cn(knop, 'border bg-card text-brand-green hover:bg-brand-mint/50')} onclick={maakAllesVoorAlle} disabled={!!bulk}>
					<Sparkles class="size-3.5" /> Maak alles voor alle concepten
				</button>
			{/if}
			<a href="{base}/storyboard" class={cn(knop, 'border bg-card text-brand-green hover:bg-brand-mint/50')}>Storyboard</a>
			<a href="{base}/pakket" class={cn(knop, 'bg-brand-green text-white hover:bg-[#00432E]')}><FileStack class="size-4" /> Briefing-pakket</a>
		</div>
	</header>

	{#if bulk}
		<div class="flex flex-wrap items-center gap-3 rounded-[18px] border border-brand-lime bg-brand-lime/20 px-4 py-3">
			<LoaderCircle class="size-4 animate-spin text-brand-green" />
			<p class="min-w-0 flex-1 text-[13px]">Bezig met concept <span class="font-semibold">{bulk.nu} van {bulk.van}</span>: {bulk.naam}</p>
			<button type="button" class="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-green underline" onclick={() => (stopBulk = true)}><X class="size-3" /> Stop na dit concept</button>
		</div>
	{/if}

	{#if fout}
		<div class="flex items-center gap-2 rounded-[14px] border border-[#F7D2BC] bg-[#FEF0E8] px-4 py-3 text-sm text-[#B8410C]">
			<TriangleAlert class="size-4 shrink-0" />{fout}
		</div>
	{/if}

	{#if concepten.length === 0}
		<div class="rounded-[22px] border border-dashed bg-card px-6 py-12 text-center">
			<p class="font-display text-xl font-bold text-brand-green">Nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Kies eerst combinaties in de Testruimte. Daarna werk je ze hier uit voor de shoot.</p>
			<a href="{base}/testruimte" class="mt-4 inline-block rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white">Naar de testruimte</a>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
			<!-- Lijst met concepten -->
			<aside class="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
				<div class="space-y-4">
					{#each groepen as g (g.fase)}
						<div>
							<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[g.fase])}>{g.fase}</span>
							<ul class="mt-2 space-y-1.5">
								{#each g.items as c (c.id)}
									{@const d = gedaan(c)}
									<li>
										<button
											type="button"
											class={cn(
												'w-full rounded-[16px] border px-3 py-2.5 text-left transition-colors',
												gekozen?.id === c.id ? 'border-brand-lime bg-card shadow-[0_6px_18px_rgba(150,210,71,0.2)]' : 'bg-card/60 hover:bg-card'
											)}
											onclick={() => (gekozenId = c.id)}
										>
											<p class="line-clamp-2 text-[13px] font-semibold leading-snug">{c.invalshoek || '(geen invalshoek)'}</p>
											<p class="mt-0.5 truncate text-[11px] text-muted-foreground">{c.format ?? '—'}{c.structuur ? ` · ${c.structuur}` : ''}</p>
											<div class="mt-1.5 flex items-center gap-1.5" title="Brief · Script · Advertentietekst · Beeld">
												{#each STAPPEN as s (s.key)}
													<span class={cn('flex size-4 items-center justify-center rounded-full text-[9px]', d[s.key] ? 'bg-brand-green text-white' : 'border border-dashed text-transparent')}><Check class="size-2.5" strokeWidth={3.5} /></span>
												{/each}
												<span class="ml-1 text-[10.5px] text-muted-foreground">{aantalKlaar(c)}/{STAPPEN.length}</span>
											</div>
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/each}

					{#if ronde.eerder.length}
						<details class="rounded-[16px] border bg-card/60 px-3 py-2 text-[12px]">
							<summary class="cursor-pointer list-none font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">Eerdere varianten ({ronde.eerder.length})</summary>
							<ul class="mt-1.5 space-y-1">
								{#each ronde.eerder as c (c.id)}
									<li><button type="button" class="text-left hover:underline" onclick={() => (gekozenId = c.id)}>{c.invalshoek || '(geen invalshoek)'}</button></li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>
			</aside>

			<!-- Het gekozen concept -->
			{#if gekozen}
				{@const c = gekozen}
				{@const d = gedaan(c)}
				<section class="min-w-0 space-y-4 rounded-[26px] border bg-card p-5">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div class="min-w-0">
							<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[bewustzijnVan(c)])}>{bewustzijnVan(c)}</span>
							<h2 class="mt-2 font-display text-2xl font-bold leading-snug text-brand-green">{c.invalshoek || '(geen invalshoek)'}</h2>
							{#if dims(c)}<p class="text-[13px] text-muted-foreground">{dims(c)}</p>{/if}
						</div>
						{#if aantalKlaar(c) < STAPPEN.length}
							<button
								type="button"
								class={cn(knop, 'bg-brand-green text-white hover:bg-[#00432E]')}
								onclick={() => maakAlles(c)}
								disabled={STAPPEN.some((s) => bezig[c.id + s.key])}
							>
								{#if STAPPEN.some((s) => bezig[c.id + s.key])}<LoaderCircle class="size-3.5 animate-spin" /> Bezig…{:else}<Sparkles class="size-3.5" /> Maak alles wat nog ontbreekt{/if}
							</button>
						{:else}
							<span class="inline-flex items-center gap-1.5 rounded-full bg-brand-lime px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-green"><Check class="size-3.5" strokeWidth={3} /> Klaar voor de designer</span>
						{/if}
					</div>

					<!-- Stappen -->
					<div class="flex flex-wrap gap-2 border-b pb-3">
						{#each STAPPEN as s, i (s.key)}
							<button
								type="button"
								class={cn(
									'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
									stap === s.key ? 'bg-brand-green text-white' : 'border bg-background text-brand-green hover:bg-brand-mint/50'
								)}
								onclick={() => (stapKeuze[c.id] = s.key)}
							>
								<span class={cn('flex size-5 items-center justify-center rounded-full text-[10.5px]', stap === s.key ? 'bg-white/25' : d[s.key] ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground')}>
									{#if d[s.key]}<Check class="size-3" strokeWidth={3.5} />{:else}{i + 1}{/if}
								</span>
								{s.label}
							</button>
						{/each}
					</div>

					<!-- 1 · Brief -->
					{#if stap === 'brief'}
						<div class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-[13px] text-muted-foreground">De strategische onderbouwing: wie, gewenst gedrag en succescriterium.</p>
								<div class="flex flex-wrap items-center gap-1.5">
									{#if briefVan(c)}
										<button type="button" class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted" onclick={() => kopieerBrief(c)}>
											{#if gekopieerd[c.id]}<Check class="size-3.5 text-brand-green" /> Gekopieerd{:else}<Copy class="size-3.5" /> Kopieer{/if}
										</button>
										<button type="button" class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted" onclick={() => exporteerBrief(c)}><Download class="size-3.5" /> Export</button>
									{/if}
									<button type="button" class={cn(knop, 'border bg-card text-brand-green hover:bg-brand-mint/50')} onclick={() => genBrief(c)} disabled={bezig[c.id + 'brief']}>
										{#if bezig[c.id + 'brief']}<LoaderCircle class="size-3.5 animate-spin" /> Genereren…{:else}<Sparkles class="size-3.5" /> {briefVan(c) ? 'Opnieuw' : 'Genereer brief'}{/if}
									</button>
								</div>
							</div>
							{#if briefVan(c)}
								{@const b = briefVan(c)!}
								<div class="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
									{#each briefSecties(c.format) as sectie (sectie.key)}
										<div>
											<p class={eyebrow}>{sectie.label}</p>
											<p class="mt-0.5 text-[13px] leading-snug">{b[sectie.key]}</p>
										</div>
									{/each}
								</div>
							{:else}
								<p class="rounded-[16px] border border-dashed px-4 py-6 text-center text-[13px] text-muted-foreground">Nog geen brief. Genereer 'm met de knop hierboven.</p>
							{/if}
						</div>

					<!-- 2 · Script -->
					{:else if stap === 'script'}
						<div class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-[13px] text-muted-foreground">Vijf beats: wat wordt er gezegd en gedaan, van hook tot call-to-action.</p>
								<button type="button" class={cn(knop, 'border bg-card text-brand-green hover:bg-brand-mint/50')} onclick={() => genScript(c)} disabled={bezig[c.id + 'script']}>
									{#if bezig[c.id + 'script']}<LoaderCircle class="size-3.5 animate-spin" /> Schrijven…{:else}<Sparkles class="size-3.5" /> {d.script ? 'Opnieuw schrijven' : 'Genereer script'}{/if}
								</button>
							</div>
							<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
								{#each SCRIPT_BEATS as b (b.key)}
									<div class="space-y-1">
										<span class={cn('block text-xs font-semibold', b.key === 'hook' ? 'text-brand-green' : 'text-muted-foreground')}>{b.label}</span>
										<Textarea bind:value={c._script[b.key]} onblur={() => saveScript(c)} rows={6} placeholder={b.hint} class="text-sm" />
									</div>
								{/each}
							</div>
						</div>

					<!-- 3 · Advertentietekst -->
					{:else if stap === 'tekst'}
						<div class="space-y-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="text-[13px] text-muted-foreground">De tekst bij de advertentie, met een voorbeeld hoe het in de feed staat.</p>
								<button type="button" class={cn(knop, 'border bg-card text-brand-green hover:bg-brand-mint/50')} onclick={() => genAd(c)} disabled={bezig[c.id + 'tekst']}>
									{#if bezig[c.id + 'tekst']}<LoaderCircle class="size-3.5 animate-spin" /> Schrijven…{:else}<Sparkles class="size-3.5" /> {d.tekst ? 'Opnieuw' : 'Genereer tekst'}{/if}
								</button>
							</div>
							<div class="grid gap-5 md:grid-cols-[minmax(0,1fr)_230px]">
								<div class="space-y-3">
									{#each ADVERTENTIE_VELDEN as v (v.key)}
										{@const waarde = c._script.advertentie?.[v.key] ?? ''}
										<div class="space-y-1">
											<div class="flex items-baseline justify-between gap-2">
												<span class="text-xs font-semibold text-muted-foreground">{v.label}</span>
												<span class={cn('text-[11px] tabular-nums', waarde.length > v.max ? 'font-semibold text-brand-orange' : 'text-muted-foreground')} title="Adviesgrens: langere tekst wordt in de feed afgekapt">{waarde.length}/{v.max}</span>
											</div>
											{#if c._script.advertentie}
												<Textarea bind:value={c._script.advertentie[v.key]} onblur={() => saveScript(c)} rows={v.rijen} placeholder={v.hint} class="text-sm" />
											{/if}
										</div>
									{/each}
								</div>
								<div>
									<p class={cn(eyebrow, 'mb-1.5')}>Zo ziet het eruit</p>
									<AdMockup
										merknaam={client.naam}
										hook={c.hook ?? ''}
										primair={c._script.advertentie?.primair ?? ''}
										kop={c._script.advertentie?.kop ?? ''}
										cta={c.cta ?? ''}
										format={c.format ?? ''}
										fase={bewustzijnVan(c)}
										titel={c.invalshoek ?? ''}
									/>
								</div>
							</div>
						</div>

					<!-- 4 · Beeld -->
					{:else}
						<div class="space-y-4">
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="space-y-1">
									<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><LinkIcon class="size-3.5" /> Referentie (link)</span>
									<div class="flex items-center gap-2">
										<Input bind:value={c.referentie} onblur={() => saveVeld(c, 'referentie')} placeholder="Instagram/Pinterest-link…" class="h-9" />
										{#if c.referentie}
											<a href={c.referentie} target="_blank" rel="noopener noreferrer" class="shrink-0 text-muted-foreground hover:text-foreground" title="Openen"><ExternalLink class="size-4" /></a>
										{/if}
									</div>
								</div>
								<div class="space-y-1">
									<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Package class="size-3.5" /> Props</span>
									<Input bind:value={c.props} onblur={() => saveVeld(c, 'props')} placeholder="Bijv. sjaal, fiets, pet…" class="h-9" />
								</div>
							</div>
							{#key c.id}
								<StoryboardBlad
									concept={{ ...c, script: c._script }}
									merknaam={client.naam}
									{base}
									toonLinks={false}
									onBeeld={(b) => (c._script.beeld = { ...b })}
								/>
							{/key}
						</div>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</div>
