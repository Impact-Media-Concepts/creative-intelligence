<script lang="ts">
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR } from '$lib/trigger-map';
	import { bouwTestbord, DOELEN, doelVan, type TestbordConcept, type TestbordVariant } from '$lib/testbord';
	import { normAdvertentie } from '$lib/productie';
	import { postJSON } from '$lib/saver.svelte';
	import type { Oordeel, GroepStatus } from '$lib/resultaten';
	import AdMockup from '$lib/components/app/AdMockup.svelte';
	import Trophy from '@lucide/svelte/icons/trophy';
	import OctagonX from '@lucide/svelte/icons/octagon-x';
	import Clock from '@lucide/svelte/icons/clock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Table from '@lucide/svelte/icons/table-2';

	let { data } = $props();
	const client = $derived(data.client);
	const base = $derived(`/klanten/${client.id}`);

	const concepten = $derived(data.concepten as unknown as TestbordConcept[]);
	const doelen = $derived(bouwTestbord(concepten));
	const aantalTests = $derived(doelen.reduce((n, d) => n + d.tests.length, 0));
	const aantalLive = $derived(concepten.filter((c) => c.status === 'Live').length);

	const STATUS: Record<GroepStatus, { tekst: string; cls: string }> = {
		klaar: { tekst: 'Klaar om te beslissen', cls: 'bg-brand-lime text-brand-green' },
		loopt: { tekst: 'Loopt nog', cls: 'bg-muted text-muted-foreground' },
		winnaar: { tekst: 'Beslist', cls: 'bg-brand-green text-white' },
		geen_data: { tekst: 'Nog geen cijfers', cls: 'bg-muted text-muted-foreground' }
	};
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
	async function zetDoel(ids: string[], doel: string) {
		fout = null;
		try {
			await postJSON('/api/concepts', { type: 'doel_zetten', ids, doel }, { taak: 'Doel wijzigen', ververs: true });
		} catch (e) {
			fout = leesFout(e);
		}
	}

	const naamVan = (v: TestbordVariant) => v.verschil || '(geen waarde)';
</script>

<div class="space-y-8 pb-16">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Bepalen en testen</p>
			<h1 class="font-display text-3xl font-bold text-brand-green">Testbord</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Alle tests in één beeld: per doel, per bewustzijnsfase, met de advertenties naast elkaar. Je ziet wat er
				getest wordt, wie voorloopt en wat de volgende ronde wordt.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<a href="{base}/testruimte" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-brand-green transition-colors hover:bg-brand-mint/50">Testset aanpassen</a>
			<a href="{base}/matrix" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted">
				<Table class="size-3.5" /> Tabelweergave
			</a>
		</div>
	</header>

	{#if fout}
		<p class="rounded-[16px] border border-[#F7D2BC] bg-[#FEF0E8] px-4 py-3 text-sm text-[#B8410C]">{fout}</p>
	{/if}

	{#if concepten.length === 0}
		<div class="rounded-[22px] border border-dashed bg-card px-6 py-12 text-center">
			<p class="font-display text-xl font-bold text-brand-green">Er is nog niets om te testen</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Stel eerst je testset samen in de Testruimte. Daarna verschijnen de tests hier.</p>
			<a href="{base}/testruimte" class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white">
				Naar de testruimte <ArrowRight class="size-4" />
			</a>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">
			<span class="font-semibold text-foreground">{aantalTests}</span> {aantalTests === 1 ? 'test' : 'tests'} ·
			<span class="font-semibold text-foreground">{concepten.length}</span> varianten ·
			<span class="font-semibold text-foreground">{aantalLive}</span> live
		</p>

		{#each doelen as doel (doel.sleutel)}
			<section class="space-y-4">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2">
					<h2 class="font-display text-2xl font-bold text-brand-green">Doel: {doel.label}</h2>
					<p class="text-sm text-muted-foreground">{doel.uitleg}</p>
				</div>

				{#each doel.tests as test (test.groep.sleutel)}
					{@const g = test.groep}
					{@const ids = test.varianten.map((v) => v.concept.id)}
					{@const hoogste = Math.max(...g.leden.map((l) => l.waarde ?? 0), 0.0001)}
					<div class="rounded-[24px] border bg-card p-5">
						<div class="flex flex-wrap items-center gap-2">
							<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[g.fase])}>{g.fase}</span>
							<span class="text-[13px] font-semibold text-brand-green">Test: {g.variabele}</span>
							{#if g.metricLabel}<span class="text-[12px] text-muted-foreground">vergeleken op {g.metricLabel}</span>{/if}
							<span class={cn('rounded-full px-3 py-1 text-[11.5px] font-semibold', STATUS[g.status].cls)}>{STATUS[g.status].tekst}</span>
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
						<p class="mt-2 text-[13px] text-muted-foreground">{g.kopregel}. {g.uitleg}</p>

						<div class="mt-4 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
							{#each test.varianten as v (v.concept.id)}
								{@const ad = adVan(v.concept)}
								<div
									class={cn(
										'flex flex-col gap-2.5 rounded-[20px] p-2.5',
										v.lid.isWinnaar ? 'bg-brand-lime/25 ring-2 ring-brand-lime' : 'bg-[#FAFCFB]'
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
											{#if v.lid.spendEuro != null}
												<span class="text-[11px] text-muted-foreground">€{Math.round(v.lid.spendEuro).toLocaleString('nl-NL')} spend</span>
											{/if}
										</div>
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
									</div>
								</div>
							{/each}

							{#if g.status === 'klaar' || g.status === 'winnaar'}
								<a
									href="{base}/sprint"
									class="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-brand-lime px-4 py-6 text-center transition-colors hover:bg-brand-lime/10"
								>
									<ArrowRight class="size-6 text-brand-green" />
									<span class="font-display text-base font-bold text-brand-green">
										{g.status === 'klaar' ? 'Beslis en ga door' : 'Volgende ronde'}
									</span>
									<span class="text-[12px] text-muted-foreground">
										{g.status === 'klaar'
											? 'Controleer de winnaar in de resultaten en bouw voort.'
											: 'Varieer format, structuur of creator van de winnaar.'}
									</span>
								</a>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/each}

		<p class="text-[12px] text-muted-foreground">
			Meerdere campagnes? Wijs een test via het keuzeveld "Doel" aan een ander doel toe; elk doel krijgt zijn eigen blok.
			Een persona-niveau komt erbij zodra concepten per persona worden vastgelegd.
		</p>
	{/if}
</div>
