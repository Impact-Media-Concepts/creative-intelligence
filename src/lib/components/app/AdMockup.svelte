<script lang="ts">
	import { cn } from '$lib/utils';
	import Play from '@lucide/svelte/icons/play';
	import Images from '@lucide/svelte/icons/images';
	import ImageIcon from '@lucide/svelte/icons/image';

	/**
	 * Een advertentie-voorbeeld in feed-vorm: zo zien designers, collega's en klanten in één blik waar een concept
	 * over gaat. Er staan alleen echte teksten uit het concept in; het beeld is een tekstvlak in de kleur van de
	 * bewustzijnsfase tot er echt beeldmateriaal is.
	 */
	let {
		merknaam,
		hook = '',
		primair = '',
		kop = '',
		cta = '',
		format = '',
		fase = '',
		titel = ''
	}: {
		merknaam: string;
		hook?: string;
		primair?: string;
		kop?: string;
		cta?: string;
		format?: string;
		fase?: string;
		/** Terugval voor het beeldvlak als er nog geen hook of tekst is (bv. de invalshoek). */
		titel?: string;
	} = $props();

	const VLAK: Record<string, string> = {
		Onbewust: 'linear-gradient(160deg,#EAF2FB,#CFE0F4)',
		Probleembewust: 'linear-gradient(160deg,#FEF0E8,#F7D2BC)',
		Oplossingsbewust: 'linear-gradient(160deg,#EAF5EF,#BFE3D2)',
		Productbewust: 'linear-gradient(160deg,#F4FAE8,#DCEBBE)',
		'Meest bewust': 'linear-gradient(160deg,#DCF3EA,#9ED6BE)'
	};

	const f = $derived(format.toLowerCase());
	const isVideo = $derived(/video|ugc|motion|reel/.test(f));
	const isCarousel = $derived(/carousel/.test(f));
	const initialen = $derived(merknaam.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() || '··');
	const korteCta = $derived(cta && cta.trim().length <= 20 ? cta.trim() : 'Meer info');
	// Boven: de echte advertentietekst. In het beeld: de hook (of anders de invalshoek). Zo staat dezelfde tekst nooit twee keer.
	const tekst = $derived(primair.trim());
	const beeldTekst = $derived((hook || titel).trim());
</script>

<div class="w-full overflow-hidden rounded-[18px] border bg-white text-[#1C1E21] shadow-sm">
	<div class="flex items-center gap-2 px-3 pt-3">
		<span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-green text-[10px] font-bold text-white">{initialen}</span>
		<div class="min-w-0 leading-tight">
			<p class="truncate text-[12px] font-semibold">{merknaam}</p>
			<p class="text-[10px] text-[#65676B]">Gesponsord</p>
		</div>
	</div>

	{#if tekst}
		<p class="mt-2 line-clamp-3 px-3 text-[12px] leading-snug">{tekst}</p>
	{:else}
		<p class="mt-2 px-3 text-[11.5px] italic leading-snug text-[#8A8D91]">Advertentietekst nog niet geschreven</p>
	{/if}

	<div class="relative mt-2 aspect-[4/5] w-full overflow-hidden" style="background:{VLAK[fase] ?? 'linear-gradient(160deg,#F2F4F3,#DDE3E0)'}">
		<span class="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-brand-green">
			{#if isCarousel}<Images class="size-3" />{:else if isVideo}<Play class="size-3" />{:else}<ImageIcon class="size-3" />{/if}
			{format || 'Format?'}
		</span>
		<p class="absolute inset-0 flex items-center justify-center px-5 text-center font-display text-[17px] font-bold leading-tight text-brand-green">
			{beeldTekst}
		</p>
		{#if isVideo}
			<span class="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-brand-green/90 text-white">
				<Play class="size-4 fill-current" />
			</span>
		{/if}
		{#if isCarousel}
			<span class="absolute inset-x-0 bottom-2 flex justify-center gap-1">
				{#each [0, 1, 2] as i (i)}<span class={cn('size-1.5 rounded-full', i === 0 ? 'bg-brand-green' : 'bg-brand-green/30')}></span>{/each}
			</span>
		{/if}
	</div>

	<div class="flex items-center justify-between gap-2 bg-[#F0F2F5] px-3 py-2">
		<p class="min-w-0 truncate text-[11px] font-semibold">{kop || merknaam}</p>
		<span class="shrink-0 rounded-md bg-[#E4E6EB] px-2 py-1 text-[10px] font-semibold">{korteCta}</span>
	</div>
</div>
