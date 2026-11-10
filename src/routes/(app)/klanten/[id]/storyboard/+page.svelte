<script lang="ts">
	import { BEWUSTZIJN_KLEUR } from '$lib/trigger-map';
	import { cn } from '$lib/utils';
	import { groepeerPerFase, type PakketConcept } from '$lib/pakket';
	import { leesScriptMetBeeld } from '$lib/storyboard';
	import StoryboardBlad from '$lib/components/app/StoryboardBlad.svelte';
	import Printer from '@lucide/svelte/icons/printer';
	import FileStack from '@lucide/svelte/icons/file-stack';

	let { data } = $props();
	const client = $derived(data.client);
	const base = $derived(`/klanten/${client.id}`);

	const concepten = $derived(data.concepten as unknown as PakketConcept[]);
	const groepen = $derived(groepeerPerFase(concepten));
	const metScript = $derived(concepten.filter((c) => leesScriptMetBeeld(c.script)).length);
</script>

<div class="space-y-8 pb-16">
	<header class="flex flex-wrap items-end justify-between gap-3 print:hidden">
		<div>
			<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Maken</p>
			<h1 class="font-display text-3xl font-bold text-brand-green">Storyboard</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				De briefing als beeld: per concept zie je scène voor scène wat er gezegd wordt en wat er in beeld moet
				staan. Zo weet een designer, editor of creator in één blik wat te maken.
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#00432E]"
				onclick={() => window.print()}
			>
				<Printer class="size-4" /> Print / PDF
			</button>
			<a href="{base}/pakket" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[13px] font-semibold text-brand-green transition-colors hover:bg-brand-mint/50">
				<FileStack class="size-4" /> Briefing-pakket
			</a>
		</div>
	</header>

	{#if concepten.length === 0}
		<div class="rounded-[22px] border border-dashed bg-card px-6 py-12 text-center">
			<p class="font-display text-xl font-bold text-brand-green">Er zijn nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Stel eerst je testset samen in de Testruimte.</p>
			<a href="{base}/testruimte" class="mt-4 inline-block rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white">Naar de testruimte</a>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2 print:hidden">
			<p class="text-sm text-muted-foreground">
				<span class="font-semibold text-foreground">{metScript}</span> van {concepten.length} concepten hebben een script.
			</p>
			<span class="text-muted-foreground">·</span>
			{#each groepen as g (g.fase)}
				<a href="#fase-{g.fase}" class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[g.fase])}>
					{g.fase} ({g.concepten.length})
				</a>
			{/each}
		</div>

		{#each groepen as g (g.fase)}
			<section id="fase-{g.fase}" class="space-y-4 scroll-mt-6">
				<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-2 print:hidden">
					<h2 class="font-display text-2xl font-bold text-brand-green">{g.fase}</h2>
					<p class="text-sm text-muted-foreground">Taak: {g.taak}</p>
				</div>
				{#each g.concepten as c (c.id)}
					<StoryboardBlad concept={c} merknaam={client.naam} {base} />
				{/each}
			</section>
		{/each}
	{/if}
</div>
