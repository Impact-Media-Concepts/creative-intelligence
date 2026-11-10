<script lang="ts">
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR } from '$lib/trigger-map';
	import { bouwTestbord, splitsRonde, DOELEN, doelVan, type TestbordConcept, type TestbordVariant } from '$lib/testbord';
	import { METRIC_VELDEN } from '$lib/sprint';
	import { normAdvertentie } from '$lib/productie';
	import { postJSON } from '$lib/saver.svelte';
	import type { Oordeel, GroepStatus, Zekerheid } from '$lib/resultaten';
	import AdMockup from '$lib/components/app/AdMockup.svelte';
	import Trophy from '@lucide/svelte/icons/trophy';
	import OctagonX from '@lucide/svelte/icons/octagon-x';
	import Clock from '@lucide/svelte/icons/clock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Table from '@lucide/svelte/icons/table-2';
	import Link2 from '@lucide/svelte/icons/link-2';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let { data } = $props();
	const client = $derived(data.client);
	const base = $derived(`/klanten/${client.id}`);

	// Lokale kopie: cijfers invullen en een winnaar markeren werkt meteen door in de balken.
	// svelte-ignore state_referenced_locally
	let lokaal = $state<TestbordConcept[]>((data.concepten as unknown as TestbordConcept[]).map((c) => ({ ...c })));
	$effect(() => {
		lokaal = (data.concepten as unknown as TestbordConcept[]).map((c) => ({ ...c }));
	});

	const ronde = $derived(splitsRonde(lokaal));
	const doelen = $derived(bouwTestbord(ronde.actueel));
	const aantalTests = $derived(doelen.reduce((n, d) => n + d.tests.length, 0));
	const aantalLive = $derived(ronde.actueel.filter((c) => c.status === 'Live').length);
	const meerdereDoelen = $derived(doelen.length > 1);

	const STATUS: Record<GroepStatus, { tekst: string; cls: string }> = {
		klaar: { tekst: 'Klaar om te beslissen', cls: 'bg-brand-lime text-brand-green' },
		loopt: { tekst: 'Loopt', cls: 'bg-muted text-muted-foreground' },
		winnaar: { tekst: 'Gewonnen', cls: 'bg-brand-green text-white' },
		geen_data: { tekst: 'Nog geen cijfers', cls: 'bg-muted text-muted-foreground' }
	};
	const ZEKER: Record<Zekerheid, string> = { zeker: '95% zeker', waarschijnlijk: '~80% zeker', te_vroeg: 'nog te vroeg' };
	const OORDEEL: Record<Oordeel, { tekst: string; cls: string }> = {
		winnaar: { tekst: 'Winnaar', cls: 'bg-brand-green text-white' },
		leidt: { tekst: 'Leidt', cls: 'bg-brand-lime text-brand-green' },
		achter: { tekst: 'Achter', cls: 'bg-muted text-muted-foreground' },
		stop: { tekst: 'Stop-advies', cls: 'bg-[#FEF0E8] text-[#B8410C]' },
		te_vroeg: { tekst: 'Te vroeg', cls: 'border border-dashed text-muted-foreground' },
		geen_data: { tekst: 'Geen cijfer', cls: 'border border-dashed text-muted-foreground' }
	};

	const adVan = (c: TestbordConcept) => {
		const s = c.script;
		return s && typeof s === 'object' ? normAdvertentie((s as Record<string, unknown>).advertentie) : normAdvertentie(null);
	};
	const naamVan = (v: TestbordVariant) => v.verschil || '(geen waarde)';

	function leesFout(e: unknown): string {
		const ruw = e instanceof Error ? e.message : 'Er ging iets mis';
		try {
			const j = JSON.parse(ruw);
			if (j?.message) return String(j.message);
		} catch {
			// geen JSON
		}
		return ruw;
	}

	let fout = $state<string | null>(null);
	let melding = $state<string | null>(null);
	let bezig = $state<Record<string, boolean>>({});

	async function zetDoel(ids: string[], doel: string) {
		fout = null;
		try {
			await postJSON('/api/concepts', { type: 'doel_zetten', ids, doel }, { taak: 'Doel wijzigen', ververs: true });
		} catch (e) {
			fout = leesFout(e);
		}
	}

	type MetricKey = (typeof METRIC_VELDEN)[number]['key'];
	function bewaarCijfers(c: TestbordConcept) {
		return postJSON('/api/sprint', {
			type: 'metrics',
			id: c.id,
			hook_rate: c.hook_rate,
			hold_rate: c.hold_rate ?? null,
			ctr: c.ctr,
			roas: c.roas,
			cpa: c.cpa,
			observatie: c.observatie ?? null
		});
	}
	async function zetCijfer(c: TestbordConcept, key: MetricKey, ruw: string) {
		const t = ruw.trim().replace(',', '.');
		const n = t === '' ? null : Number(t);
		c[key] = n != null && Number.isFinite(n) ? n : null;
		fout = null;
		try {
			await bewaarCijfers(c);
		} catch (e) {
			fout = leesFout(e);
		}
	}

	async function markeerWinnaar(id: string) {
		const c = lokaal.find((x) => x.id === id);
		if (!c) return;
		fout = null;
		melding = null;
		bezig[id] = true;
		try {
			const nieuw = !c.is_winnaar;
			c.is_winnaar = nieuw;
			await postJSON('/api/sprint', { type: 'winnaar', id, waarde: nieuw });
		} catch (e) {
			c.is_winnaar = !c.is_winnaar;
			fout = leesFout(e);
		} finally {
			bezig[id] = false;
		}
	}

	async function volgendeRonde(id: string) {
		bezig['v' + id] = true;
		fout = null;
		melding = null;
		try {
			const res = await postJSON<{ concepten: unknown[]; volgendeVariabele: string }>(
				'/api/sprint',
				{ type: 'vervolg', id },
				{ taak: 'Volgende testronde', ververs: true }
			);
			melding = `${res.concepten.length} nieuwe varianten gemaakt om "${res.volgendeVariabele}" te testen. Ze staan hieronder in de volgende ronde.`;
		} catch (e) {
			fout = leesFout(e);
		} finally {
			bezig['v' + id] = false;
		}
	}

	const winnaarVan = (t: { varianten: TestbordVariant[] }) => t.varianten.find((v) => v.lid.isWinnaar) ?? null;
</script>

<div class="space-y-7 pb-16">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Testen</p>
			<h1 class="font-display text-3xl font-bold text-brand-green">
				Testbord{#if ronde.huidig != null}<span class="ml-2 text-xl font-semibold text-muted-foreground">· ronde {ronde.huidig}</span>{/if}
			</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{aantalTests} {aantalTests === 1 ? 'test' : 'tests'} · {ronde.actueel.length} varianten · {aantalLive} live
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a href="{base}/sprint" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-brand-green transition-colors hover:bg-brand-mint/50">
				<Link2 class="size-3.5" /> Meta-koppeling
			</a>
			<a href="{base}/testruimte" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-brand-green transition-colors hover:bg-brand-mint/50">Testset aanpassen</a>
			<a href="{base}/matrix" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted">
				<Table class="size-3.5" /> Tabel
			</a>
		</div>
	</header>

	{#if fout}
		<p class="rounded-[16px] border border-[#F7D2BC] bg-[#FEF0E8] px-4 py-3 text-sm text-[#B8410C]">{fout}</p>
	{/if}
	{#if melding}
		<p class="rounded-[16px] bg-brand-lime/40 px-4 py-3 text-sm font-medium text-brand-green">{melding}</p>
	{/if}

	{#if lokaal.length === 0}
		<div class="rounded-[22px] border border-dashed bg-card px-6 py-12 text-center">
			<p class="font-display text-xl font-bold text-brand-green">Er is nog niets om te testen</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Stel eerst je testset samen in de Testruimte. Daarna verschijnen de varianten hier.</p>
			<a href="{base}/testruimte" class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white">
				Naar de testruimte <ArrowRight class="size-4" />
			</a>
		</div>
	{:else}
		{#each doelen as doel (doel.sleutel)}
			<section class="space-y-6">
				{#if meerdereDoelen}
					<h2 class="border-b pb-2 font-display text-2xl font-bold text-brand-green">Doel: {doel.label}</h2>
				{/if}

				{#each doel.tests as test (test.groep.sleutel)}
					{@const g = test.groep}
					{@const ids = test.varianten.map((v) => v.concept.id)}
					{@const hoogste = Math.max(...g.leden.map((l) => l.waarde ?? 0), 0.0001)}
					{@const winnaar = winnaarVan(test)}
					<div class="space-y-3">
						<!-- Kop: fase, test, voortgang, status -->
						<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
							<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[g.fase])}>{g.fase}</span>
							<span class="text-[13px] font-semibold text-brand-green">Test: {g.variabele}</span>

							<div class="flex min-w-[200px] flex-1 items-center gap-2.5 sm:max-w-[360px]" title="Hoeveel van de test erop zit: spend, vertoningen, dagen en aankopen, en of het verschil zeker is">
								{#if g.voortgangPct != null}
									<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
										<div
											class={cn('h-full rounded-full transition-all', g.voortgangPct >= 100 ? 'bg-brand-green' : 'bg-brand-action')}
											style="width:{Math.max(3, g.voortgangPct)}%"
										></div>
									</div>
									<span class="w-9 shrink-0 text-right text-[12px] font-bold tabular-nums text-brand-green">{g.voortgangPct}%</span>
								{:else}
									<span class="text-[12px] text-muted-foreground">Handmatige cijfers — geen voortgangsmeting</span>
								{/if}
							</div>

							<span class={cn('rounded-full px-3 py-1 text-[11.5px] font-semibold', STATUS[g.status].cls)}>{STATUS[g.status].tekst}</span>
							{#if g.zekerheid}<span class="text-[12px] text-muted-foreground">{ZEKER[g.zekerheid]}</span>{/if}

							<label class="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
								Doel
								<select
									class="rounded-full border bg-background px-2.5 py-1 text-[12px] font-medium text-foreground"
									value={doelVan(test.varianten[0].concept)}
									onchange={(e) => zetDoel(ids, e.currentTarget.value)}
								>
									{#each DOELEN as d (d.sleutel)}<option value={d.sleutel}>{d.label}</option>{/each}
									{#if !DOELEN.some((d) => d.sleutel === doel.sleutel)}<option value={doel.sleutel}>{doel.label}</option>{/if}
								</select>
							</label>
						</div>

						{#if g.voortgangPct != null && g.status === 'loopt'}
							<p class="text-[12.5px] text-muted-foreground">{g.uitleg}</p>
						{/if}

						<!-- Beslissen / volgende ronde -->
						{#if g.status === 'klaar' && g.leiderId}
							{@const leider = test.varianten.find((v) => v.concept.id === g.leiderId)}
							<div class="flex flex-wrap items-center gap-3 rounded-[18px] border border-brand-lime bg-brand-lime/20 px-4 py-3">
								<Trophy class="size-5 shrink-0 text-brand-green" />
								<p class="min-w-0 flex-1 text-[13px]"><span class="font-semibold text-brand-green">{leider ? naamVan(leider) : 'De leider'}</span> lijkt te winnen. {g.uitleg}</p>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#00432E] disabled:opacity-60"
									onclick={() => g.leiderId && markeerWinnaar(g.leiderId)}
									disabled={bezig[g.leiderId]}
								>
									Markeer als winnaar
								</button>
							</div>
						{:else if g.status === 'winnaar' && winnaar}
							<div class="flex flex-wrap items-center gap-3 rounded-[18px] border border-brand-green/30 bg-brand-mint/50 px-4 py-3">
								<Trophy class="size-5 shrink-0 text-brand-green" />
								<p class="min-w-0 flex-1 text-[13px]"><span class="font-semibold text-brand-green">{naamVan(winnaar)}</span> heeft gewonnen. Bouw voort op de winnaar in de volgende ronde.</p>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#00432E] disabled:opacity-60"
									onclick={() => volgendeRonde(winnaar.concept.id)}
									disabled={bezig['v' + winnaar.concept.id]}
								>
									{#if bezig['v' + winnaar.concept.id]}<LoaderCircle class="size-3.5 animate-spin" /> Bezig…{:else}<Sparkles class="size-3.5" /> Volgende ronde{/if}
								</button>
							</div>
						{/if}

						<!-- De varianten -->
						<div class="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
							{#each test.varianten as v (v.concept.id)}
								{@const ad = adVan(v.concept)}
								<div
									class={cn(
										'flex flex-col gap-2.5 rounded-[20px] p-2.5',
										v.lid.isWinnaar ? 'bg-brand-lime/25 ring-2 ring-brand-lime' : 'bg-card ring-1 ring-border'
									)}
								>
									<AdMockup
										merknaam={client.naam}
										hook={v.concept.hook ?? ''}
										primair={ad.primair}
										kop={ad.kop}
										cta={v.concept.cta ?? ''}
										format={v.concept.format ?? ''}
										fase={g.fase}
										titel={naamVan(v)}
									/>
									<div class="px-1">
										<p class="line-clamp-2 text-[12.5px] font-semibold leading-snug" title={naamVan(v)}>{naamVan(v)}</p>
										<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
											<span class="text-[13px] font-bold tabular-nums text-brand-green">{v.lid.waardeLabel}</span>
											<span class={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', OORDEEL[v.lid.oordeel].cls)}>
												{#if v.lid.oordeel === 'winnaar'}<Trophy class="size-3" />{:else if v.lid.oordeel === 'stop'}<OctagonX class="size-3" />{:else if v.lid.oordeel === 'te_vroeg'}<Clock class="size-3" />{/if}
												{OORDEEL[v.lid.oordeel].tekst}
											</span>
										</div>
										{#if v.lid.spendEuro != null}
											<p class="mt-1 text-[11.5px] text-muted-foreground">€{Math.round(v.lid.spendEuro).toLocaleString('nl-NL')} uitgegeven</p>
										{/if}
										{#if v.lid.waarde != null}
											<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
												<div
													class={cn('h-full rounded-full', v.lid.oordeel === 'stop' ? 'bg-brand-orange' : v.lid.oordeel === 'achter' || v.lid.oordeel === 'te_vroeg' ? 'bg-[#B9C6BF]' : 'bg-brand-action')}
													style="width:{Math.max(3, ((v.lid.waarde ?? 0) / hoogste) * 100)}%"
												></div>
											</div>
										{:else}
											<p class="mt-1.5 text-[11px] text-muted-foreground">{v.concept.status === 'Live' ? 'Live — wacht op cijfers' : 'Nog niet live'}</p>
										{/if}

										<details class="mt-2 text-[12px]">
											<summary class="cursor-pointer list-none font-semibold text-brand-green [&::-webkit-details-marker]:hidden">Cijfers invoeren</summary>
											<div class="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
												{#each METRIC_VELDEN as m (m.key)}
													<label class="flex flex-col text-[10.5px] text-muted-foreground">
														{m.label} ({m.suffix})
														<input
															type="text"
															inputmode="decimal"
															class="mt-0.5 h-7 rounded-md border bg-background px-1.5 text-[12px] text-foreground tabular-nums"
															value={v.concept[m.key] ?? ''}
															onchange={(e) => zetCijfer(v.concept, m.key, e.currentTarget.value)}
														/>
													</label>
												{/each}
											</div>
											{#if v.lid.oordeel !== 'winnaar'}
												<button type="button" class="mt-2 text-[11.5px] font-semibold text-brand-green underline" onclick={() => markeerWinnaar(v.concept.id)}>Markeer als winnaar</button>
											{:else}
												<button type="button" class="mt-2 text-[11.5px] font-semibold text-muted-foreground underline" onclick={() => markeerWinnaar(v.concept.id)}>Winnaar-markering weghalen</button>
											{/if}
										</details>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</section>
		{/each}

		{#if ronde.eerder.length}
			<details class="rounded-[22px] border bg-card">
				<summary class="cursor-pointer list-none px-5 py-3.5 font-display text-lg font-bold text-brand-green [&::-webkit-details-marker]:hidden">
					Eerdere varianten <span class="text-sm font-normal text-muted-foreground">({ronde.eerder.length})</span>
				</summary>
				<ul class="space-y-1 px-5 pb-4">
					{#each ronde.eerder as c (c.id)}
						<li class="flex flex-wrap items-center gap-2 text-[13px]">
							{#if c.is_winnaar}<Trophy class="size-3.5 text-brand-green" />{/if}
							<span class="font-medium">{c.invalshoek || '(geen invalshoek)'}</span>
							<span class="text-muted-foreground">· {c.format ?? '—'} · {c.status}{c.ronde != null ? ` · ronde ${c.ronde}` : ''}</span>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>
