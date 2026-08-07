<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { cn } from '$lib/utils';
	import { datumKort } from '$lib/format';
	import type { Concept } from '$lib/supabase/database.types';
	import type { Analyse } from '$lib/sprint';
	import { METRIC_VELDEN } from '$lib/sprint';
	import { invalshoekStatus } from '$lib/trigger-map';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Brain from '@lucide/svelte/icons/brain';
	import ThumbsUp from '@lucide/svelte/icons/thumbs-up';
	import ThumbsDown from '@lucide/svelte/icons/thumbs-down';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	let { data } = $props();

	/** Een concept telt als "getest" (= een learning) zodra er een resultaat/observatie/analyse is. */
	function isGetest(c: Concept): boolean {
		return (
			c.is_winnaar ||
			c.hook_rate != null ||
			c.hold_rate != null ||
			c.ctr != null ||
			c.roas != null ||
			c.cpa != null ||
			!!c.observatie ||
			!!c.ai_analyse
		);
	}

	let learnings = $derived(data.concepten.filter(isGetest));
	let aantalWinnaars = $derived(learnings.filter((c) => c.is_winnaar).length);

	let invWerkt = $derived(data.invalshoeken.filter((i) => invalshoekStatus(i) === 'Getest — werkt'));
	let invWerktNiet = $derived(
		data.invalshoeken.filter((i) => invalshoekStatus(i) === 'Getest — werkt niet')
	);

	function analyseVan(c: Concept): Analyse | null {
		return (c.ai_analyse as Analyse | null) ?? null;
	}
	function heeftMetrics(c: Concept): boolean {
		return METRIC_VELDEN.some((m) => c[m.key] != null);
	}

	const funnelKleur: Record<string, string> = {
		TOFU: 'border-blue-300 bg-blue-100 text-blue-800',
		MOFU: 'border-amber-300 bg-amber-100 text-amber-800',
		BOFU: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green'
	};
</script>

<div class="space-y-6">
	<div
		data-tour-order="1"
		data-tour-title="Learnings — de loop sluit"
		data-tour-text="Het geheugen van de klant: wat werkte, welke invalshoeken bevestigd of ontkracht zijn, en de winnaars. Deze learnings voeden automatisch de volgende matrix-ronde — zo wordt elke ronde slimmer."
	>
		<h2 class="text-lg font-semibold">Learnings</h2>
		<p class="text-sm text-muted-foreground">
			Wat elke test heeft opgeleverd — automatisch samengevat uit je sprintresultaten. Het geheugen
			van deze klant: bevestigde invalshoeken, winnaars en de volgende stappen.
		</p>
	</div>

	<!-- Samenvatting -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-lg border p-3">
			<p class="text-2xl font-semibold">{learnings.length}</p>
			<p class="text-xs text-muted-foreground">tests met resultaat</p>
		</div>
		<div class="rounded-lg border p-3">
			<p class="text-2xl font-semibold text-brand-green">{aantalWinnaars}</p>
			<p class="text-xs text-muted-foreground">winnaars</p>
		</div>
		<div class="rounded-lg border p-3">
			<p class="text-2xl font-semibold text-brand-green">{invWerkt.length}</p>
			<p class="text-xs text-muted-foreground">invalshoeken bevestigd</p>
		</div>
		<div class="rounded-lg border p-3">
			<p class="text-2xl font-semibold text-red-600">{invWerktNiet.length}</p>
			<p class="text-xs text-muted-foreground">invalshoeken ontkracht</p>
		</div>
	</div>

	<!-- Bevestigde / ontkrachte invalshoeken -->
	{#if invWerkt.length || invWerktNiet.length}
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#if invWerkt.length}
				<div class="rounded-lg border border-brand-lime/40 bg-brand-mint/30 p-3">
					<p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-green">
						<ThumbsUp class="size-4" /> Werkt
					</p>
					<ul class="space-y-1 text-sm">
						{#each invWerkt as i (i.naam)}
							<li class="flex gap-2">
								<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-green"></span>
								<span>{i.naam}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if invWerktNiet.length}
				<div class="rounded-lg border border-red-200 bg-red-50 p-3">
					<p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-red-700">
						<ThumbsDown class="size-4" /> Werkt niet
					</p>
					<ul class="space-y-1 text-sm">
						{#each invWerktNiet as i (i.naam)}
							<li class="flex gap-2">
								<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-400"></span>
								<span>{i.naam}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Tijdlijn -->
	{#if learnings.length === 0}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<Brain class="mx-auto size-6 text-accent" />
			<p class="mt-2 text-sm font-medium text-foreground">Nog geen learnings</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Zodra je in de <a class="text-brand-green underline" href="/klanten/{data.client.id}/sprint"
					>Sprint</a
				> resultaten invult, een analyse laat maken of een winnaar markeert, verschijnen de learnings hier.
			</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each learnings as c (c.id)}
				{@const a = analyseVan(c)}
				<Card.Root class={cn(c.is_winnaar && 'border-brand-lime/60 bg-brand-lime/5')}>
					<Card.Content class="space-y-3 pt-6">
						<div class="flex flex-wrap items-center gap-2">
							{#if c.funnelfase}
								<Badge variant="outline" class={cn('font-medium', funnelKleur[c.funnelfase])}>
									{c.funnelfase}
								</Badge>
							{/if}
							<span class="font-medium">{c.invalshoek || '(geen invalshoek)'}</span>
							{#if c.variabele}
								<span class="text-xs text-muted-foreground">· getest: {c.variabele}</span>
							{/if}
							{#if c.is_winnaar}
								<Badge
									variant="outline"
									class="ml-auto border-brand-lime/50 bg-brand-lime/20 font-medium text-brand-green"
								>
									<Trophy class="size-3.5" /> Winnaar
								</Badge>
							{/if}
							<span class={cn('text-xs text-muted-foreground', !c.is_winnaar && 'ml-auto')}>
								{datumKort(c.updated_at)}
							</span>
						</div>

						{#if c.format || c.structuur || c.creator_type}
							<p class="text-xs text-muted-foreground">
								{[c.format, c.structuur, c.creator_type].filter(Boolean).join(' · ')}
							</p>
						{/if}

						{#if heeftMetrics(c)}
							<div class="flex flex-wrap gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
								{#each METRIC_VELDEN as m (m.key)}
									{#if c[m.key] != null}
										<span>
											<span class="text-muted-foreground">{m.label}:</span>
											{c[m.key]}{m.suffix}
										</span>
									{/if}
								{/each}
							</div>
						{/if}

						{#if c.observatie}
							<p class="text-sm">
								<span class="text-muted-foreground">Observatie:</span>
								{c.observatie}
							</p>
						{/if}

						{#if a}
							<div class="space-y-1.5 rounded-md border border-brand-lime/40 bg-brand-mint/30 p-3 text-sm">
								{#if a.wat_werkte}
									<p class="flex items-start gap-1.5">
										<Brain class="mt-0.5 size-4 shrink-0 text-brand-green" />
										<span><span class="font-medium">Wat werkte:</span> {a.wat_werkte}</span>
									</p>
								{/if}
								{#if a.volgende_stap}
									<p class="flex items-start gap-1.5">
										<ArrowRight class="mt-0.5 size-4 shrink-0 text-brand-green" />
										<span><span class="font-medium">Volgende stap:</span> {a.volgende_stap}</span>
									</p>
								{/if}
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
