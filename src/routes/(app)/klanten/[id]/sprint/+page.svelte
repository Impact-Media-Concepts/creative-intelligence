<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import { saver, postJSON } from '$lib/saver.svelte';
	import { cn } from '$lib/utils';
	import { page } from '$app/state';
	import type { Concept } from '$lib/supabase/database.types';
	import type { Analyse } from '$lib/sprint';
	import { METRIC_VELDEN } from '$lib/sprint';
	import { TESTVOLGORDE } from '$lib/matrix';
	import { conceptAdCode } from '$lib/meta';
	import MetaKoppeling from '$lib/components/app/MetaKoppeling.svelte';
	import Brain from '@lucide/svelte/icons/brain';
	import Trophy from '@lucide/svelte/icons/trophy';
	import GitBranch from '@lucide/svelte/icons/git-branch';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let { data } = $props();

	const clientId = $derived(page.params.id ?? '');
	const heeftMeta = $derived(!!data.metaConnectie);

	async function koppelAd(c: Concept, adId: string) {
		c.meta_ad_external_id = adId || null;
		await postJSON('/api/meta', {
			type: 'link',
			conceptId: c.id,
			ad_external_id: adId || null
		});
	}
	async function toggleAutoSync(c: Concept) {
		c.meta_auto_sync = !c.meta_auto_sync;
		await postJSON('/api/meta', {
			type: 'toggle_auto_sync',
			conceptId: c.id,
			waarde: c.meta_auto_sync
		});
	}

	// svelte-ignore state_referenced_locally
	let concepten = $state<Concept[]>(data.concepten.map((c) => ({ ...c })));
	$effect(() => {
		concepten = data.concepten.map((c) => ({ ...c }));
	});

	let bezigAnalyse = $state<Record<string, boolean>>({});
	let bezigVervolg = $state<Record<string, boolean>>({});
	let fout = $state<string | null>(null);
	let vervolgMelding = $state<string | null>(null);

	const veldClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
	const funnelKleur: Record<string, string> = {
		TOFU: 'border-blue-300 bg-blue-100 text-blue-800',
		MOFU: 'border-amber-300 bg-amber-100 text-amber-800',
		BOFU: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green'
	};

	function saveMetrics(c: Concept) {
		return postJSON('/api/sprint', {
			type: 'metrics',
			id: c.id,
			hook_rate: c.hook_rate,
			hold_rate: c.hold_rate,
			ctr: c.ctr,
			roas: c.roas,
			cpa: c.cpa,
			observatie: c.observatie
		});
	}
	async function toggleWinnaar(c: Concept) {
		c.is_winnaar = !c.is_winnaar;
		vervolgMelding = null;
		const { invalshoekBijgewerkt } = await postJSON<{ invalshoekBijgewerkt: string | null }>(
			'/api/sprint',
			{ type: 'winnaar', id: c.id, waarde: c.is_winnaar }
		);
		if (c.is_winnaar && invalshoekBijgewerkt) {
			vervolgMelding = `Invalshoek "${invalshoekBijgewerkt}" is in de test-backlog gemarkeerd als "Getest — werkt".`;
		}
	}
	async function genAnalyse(c: Concept) {
		bezigAnalyse[c.id] = true;
		fout = null;
		try {
			await postJSON<{ analyse: Analyse }>(
				'/api/sprint',
				{ type: 'analyse', id: c.id },
				{ taak: 'Learning-analyse', ververs: true }
			);
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Analyse mislukt';
		} finally {
			bezigAnalyse[c.id] = false;
		}
	}
	async function vervolg(c: Concept) {
		bezigVervolg[c.id] = true;
		fout = null;
		vervolgMelding = null;
		try {
			const { concepten: nieuw, volgendeVariabele } = await postJSON<{
				concepten: Concept[];
				volgendeVariabele: string;
			}>('/api/sprint', { type: 'vervolg', id: c.id }, { taak: 'Volgende testronde', ververs: true });
			vervolgMelding = `${nieuw.length} nieuwe concepten aangemaakt om "${volgendeVariabele}" te testen (invalshoek + winnende variabelen gelijk gehouden). Je vindt ze in de Matrix.`;
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Volgende testronde genereren mislukt';
		} finally {
			bezigVervolg[c.id] = false;
		}
	}

	function analyse(c: Concept): Analyse | null {
		return (c.ai_analyse as Analyse | null) ?? null;
	}
</script>

<div class="space-y-5">
	<!-- Kop -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div
			data-tour-order="1"
			data-tour-title="Sprint — testen & resultaten"
			data-tour-text="Hier voer je de resultaten in (hook rate, CTR, ROAS, CPA), laat je Claude de learning bepalen en markeer je de winnaar. Een winnaar zet de bijbehorende invalshoek op 'werkt' — zo sluit de loop."
		>
			<h2 class="text-lg font-semibold">Sprint</h2>
			<p class="text-sm text-muted-foreground">
				Voer per concept de resultaten in, laat Claude de learning bepalen, en markeer de winnaar.
			</p>
		</div>
		<div class="flex items-center gap-1.5 text-xs">
			{#if saver.fout}
				<TriangleAlert class="size-3.5 text-destructive" />
				<span class="text-destructive">Opslaan mislukt</span>
			{:else if saver.actief > 0}
				<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" />
				<span class="text-muted-foreground">Opslaan…</span>
			{:else if saver.laatstOpgeslagen}
				<Check class="size-3.5 text-brand-green" />
				<span class="text-muted-foreground">Opgeslagen</span>
			{/if}
		</div>
	</div>

	<!-- Testvolgorde -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-brand-lime/40 bg-brand-mint/50 px-3 py-2 text-sm"
	>
		<span class="font-medium text-brand-green">Testvolgorde:</span>
		{#each TESTVOLGORDE as stap, i (stap)}
			<span class="font-medium text-foreground">{stap}</span>
			{#if i < TESTVOLGORDE.length - 1}<span class="text-muted-foreground">→</span>{/if}
		{/each}
		<span class="text-muted-foreground">· markeer de winnaar en maak er een vervolgtest van.</span>
	</div>

	<!-- Meta-koppeling: automatisch resultaten uitlezen -->
	<MetaKoppeling {clientId} connectie={data.metaConnectie} />

	{#if fout}
		<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			<TriangleAlert class="size-4 shrink-0" />
			{fout}
		</div>
	{/if}

	{#if vervolgMelding}
		<div class="flex items-center gap-2 rounded-md border border-brand-lime/40 bg-brand-mint/50 px-3 py-2 text-sm text-brand-green">
			<Check class="size-4 shrink-0" />
			{vervolgMelding}
		</div>
	{/if}

	{#if concepten.length === 0}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<p class="text-sm font-medium text-foreground">Nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Maak eerst concepten aan in de <strong>Matrix</strong>. Daarna kun je hier per concept de
				resultaten en learnings bijhouden.
			</p>
		</div>
	{:else}
		{#each concepten as c (c.id)}
			<Card.Root class={cn(c.is_winnaar && 'border-brand-lime/60 bg-brand-lime/5')}>
				<Card.Header>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							{#if c.funnelfase}
								<Badge variant="outline" class={cn('font-medium', funnelKleur[c.funnelfase])}>
									{c.funnelfase}
								</Badge>
							{/if}
							<Card.Title class="text-base">{c.invalshoek || '(geen invalshoek)'}</Card.Title>
							{#if c.variabele}
								<span class="text-xs text-muted-foreground">· test: {c.variabele}</span>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							{#if c.auto_winnaar}
								<Badge variant="outline" class="border-brand-lime/50 bg-brand-lime/15 text-brand-green">
									<Sparkles class="mr-1 size-3" />
									Automatisch gemarkeerd
								</Badge>
							{/if}
							<Button
								variant={c.is_winnaar ? 'default' : 'outline'}
								size="sm"
								onclick={() => toggleWinnaar(c)}
							>
								<Trophy class="size-4" />
								{c.is_winnaar ? 'Winnaar' : 'Markeer als winnaar'}
							</Button>
						</div>
					</div>
				</Card.Header>

				<Card.Content class="space-y-4">
					<!-- Metrics -->
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
						{#each METRIC_VELDEN as m (m.key)}
							<div class="space-y-1">
								<span class="block text-xs font-medium text-muted-foreground">
									{m.label} ({m.suffix})
								</span>
								<input
									type="number"
									step="0.1"
									bind:value={c[m.key]}
									onblur={() => saveMetrics(c)}
									class={veldClass}
								/>
							</div>
						{/each}
					</div>
					<div class="space-y-1">
						<span class="block text-xs font-medium text-muted-foreground">Kwalitatieve observatie</span>
						<Textarea
							bind:value={c.observatie}
							onblur={() => saveMetrics(c)}
							rows={2}
							placeholder="Bijv. veel vrouwen in comments die het delen met hun man; hoge saves, weinig clicks…"
						/>
					</div>

					<!-- Meta-koppeling per concept -->
					{#if heeftMeta}
						<div class="flex flex-col gap-2 rounded-md border border-dashed bg-muted/20 p-3">
							<div class="flex flex-wrap items-center gap-2">
								<Link2 class="size-4 shrink-0 text-muted-foreground" />
								<span class="text-xs text-muted-foreground">Gekoppelde advertentie:</span>
								<select
									value={c.meta_ad_external_id ?? ''}
									onchange={(e) => koppelAd(c, e.currentTarget.value)}
									class={cn(veldClass, 'max-w-xs')}
								>
									<option value="">— niet gekoppeld —</option>
									{#each data.metaAds as ad (ad.external_id)}
										<option value={ad.external_id}>{ad.naam || ad.external_id}</option>
									{/each}
								</select>
							</div>
							<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<label class="inline-flex cursor-pointer items-center gap-1.5">
									<input
										type="checkbox"
										checked={c.meta_auto_sync}
										onchange={() => toggleAutoSync(c)}
										class="size-3.5 accent-brand-green"
									/>
									Metrics automatisch bijwerken
								</label>
								<span>
									Ad-naam code:
									<code class="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{conceptAdCode(c.id)}</code>
								</span>
								{#if c.meta_laatste_sync}
									<span class="inline-flex items-center gap-1 text-brand-green">
										<Check class="size-3" />
										Bijgewerkt {new Date(c.meta_laatste_sync).toLocaleDateString('nl-NL')}
									</span>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Acties -->
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" size="sm" onclick={() => genAnalyse(c)} disabled={bezigAnalyse[c.id]}>
							{#if bezigAnalyse[c.id]}
								<LoaderCircle class="size-4 animate-spin" />
								Analyseren…
							{:else}
								<Brain class="size-4" />
								Analyseer resultaten
							{/if}
						</Button>
						{#if c.is_winnaar}
							<Button variant="outline" size="sm" onclick={() => vervolg(c)} disabled={bezigVervolg[c.id]}>
								{#if bezigVervolg[c.id]}
									<LoaderCircle class="size-4 animate-spin" />
									Volgende ronde genereren…
								{:else}
									<GitBranch class="size-4" />
									Volgende testronde genereren
								{/if}
							</Button>
						{/if}
					</div>

					<!-- Learning-analyse -->
					{#if analyse(c)}
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
							<div class="rounded-md border border-brand-lime/40 bg-brand-lime/5 p-3">
								<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-green">
									Wat werkte
								</p>
								<p class="text-sm">{analyse(c)?.wat_werkte}</p>
							</div>
							<div class="rounded-md border border-amber-300 bg-amber-50 p-3">
								<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
									Volgende stap
								</p>
								<p class="text-sm">{analyse(c)?.volgende_stap}</p>
							</div>
						</div>
					{/if}

				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>
