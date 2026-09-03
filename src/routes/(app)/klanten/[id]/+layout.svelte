<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/app/StatusBadge.svelte';
	import CreativeLoop from '$lib/components/app/CreativeLoop.svelte';
	import CreativeLoopCompact from '$lib/components/app/CreativeLoopCompact.svelte';
	import { cn } from '$lib/utils';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Pencil from '@lucide/svelte/icons/pencil';

	let { data, children } = $props();
	let client = $derived(data.client);
	let base = $derived(`/klanten/${client.id}`);
	let pad = $derived(page.url.pathname);

	let tabs = $derived([
		{ label: 'Overzicht', href: base },
		{ label: 'Intake', href: `${base}/intake` },
		{ label: 'Trigger Map', href: `${base}/triggermap` },
		{ label: 'Testruimte', href: `${base}/testruimte` },
		{ label: 'Matrix', href: `${base}/matrix` },
		{ label: 'Brief', href: `${base}/brief` },
		{ label: 'Sprint', href: `${base}/sprint` },
		{ label: 'Learnings', href: `${base}/learnings` }
	]);

	function tabActief(href: string): boolean {
		return href === base ? pad === base : pad.startsWith(href);
	}
</script>

<svelte:head>
	<title>{client.naam} · Creative Intelligence</title>
</svelte:head>

<div class="mx-auto max-w-6xl px-8 py-8">
	<a
		href="/"
		class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
	>
		<ArrowLeft class="size-4" />
		Klanten
	</a>

	<div class="mt-3 flex items-start justify-between gap-4">
		<div class="min-w-0">
			<div class="flex items-center gap-3">
				<h1 class="truncate text-2xl font-bold text-foreground">{client.naam}</h1>
				<StatusBadge status={client.status} />
			</div>
			<p class="mt-1 text-sm text-muted-foreground">{client.sector || 'Geen sector'}</p>
		</div>
		<Button href={`${base}/bewerken`} variant="outline" class="shrink-0">
			<Pencil class="size-4" />
			Bewerken
		</Button>
	</div>

	<!-- Creative Loop: volledig op het overzicht, compact op de werk-tabs -->
	{#if pad === base}
		<div
			class="mt-6 rounded-xl border bg-card p-4"
			data-tour-order="1"
			data-tour-title="De Creative Loop"
			data-tour-text="Het hart van de tool: elke klant doorloopt deze 7 stappen (Intake → Trigger Map → Matrix → Sprint) en start daarna opnieuw met de learnings. De ring licht op bij de huidige fase; klik een bolletje om er direct heen te springen."
		>
			<CreativeLoop fase={client.huidige_fase} {base} />
		</div>
	{:else}
		<div class="mt-6">
			<CreativeLoopCompact fase={client.huidige_fase} {base} />
		</div>
	{/if}

	<!-- Tabs -->
	<div class="mt-6 border-b">
		<nav class="flex gap-1">
			{#each tabs as t (t.href)}
				<a
					href={t.href}
					class={cn(
						'-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
						tabActief(t.href)
							? 'border-primary text-primary'
							: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
					)}
				>
					{t.label}
				</a>
			{/each}
		</nav>
	</div>

	<div class="mt-6">
		{@render children()}
	</div>
</div>
