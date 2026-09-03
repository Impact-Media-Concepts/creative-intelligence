<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/app/StatusBadge.svelte';
	import CreativeLoop from '$lib/components/app/CreativeLoop.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';

	let { data, children } = $props();
	let client = $derived(data.client);
	let base = $derived(`/klanten/${client.id}`);
	let pad = $derived(page.url.pathname);
</script>

<svelte:head>
	<title>{client.naam} · Creative Intelligence</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-8 py-8">
	<div class="flex items-start justify-between gap-4">
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

	<!-- Creative Loop-wiel: alleen op het overzicht (de fasen staan links in de sidebar) -->
	{#if pad === base}
		<div
			class="mt-6 rounded-xl border bg-card p-4"
			data-tour-order="1"
			data-tour-title="De Creative Loop"
			data-tour-text="Het hart van de tool: elke klant doorloopt deze stappen (Intake → Trigger Map → Testruimte → Matrix → Productie → Sprint) en start daarna opnieuw met de learnings. Links in de balk klik je direct naar elke fase."
		>
			<CreativeLoop fase={client.huidige_fase} {base} />
		</div>
	{/if}

	<div class="mt-6">
		{@render children()}
	</div>
</div>
