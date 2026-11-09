<script lang="ts">
	/** Emerald hero bovenaan de trigger map: één zin samenvatting + voortgangsring. */
	let {
		samenvatting,
		pct,
		hint
	}: { samenvatting: string; pct: number; hint: string } = $props();

	const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.14em]';
</script>

<section class="relative overflow-hidden rounded-[28px] bg-sidebar px-[30px] py-[26px] text-white">
	<!-- Decoratieve beams (merkvorm), puur sfeer -->
	<div class="pointer-events-none absolute -top-16 right-6 flex rotate-[14deg] gap-8 opacity-[0.12]" aria-hidden="true">
		{#each [0, 1, 2] as i (i)}
			<div class="flex flex-col items-center gap-2">
				<div class="size-11 rounded-full bg-sidebar-primary"></div>
				<div class="h-56 w-11 rounded-full bg-sidebar-primary"></div>
			</div>
		{/each}
	</div>

	<div class="relative flex flex-wrap items-center justify-between gap-6">
		<div class="max-w-[660px]">
			<span class={eyebrow + ' text-sidebar-primary'}>Trigger map · samenvatting</span>
			<h2 class="mt-2 font-display text-2xl font-bold leading-[1.3]">{samenvatting}</h2>
		</div>
		<div class="flex items-center gap-4">
			<div
				class="flex size-24 shrink-0 items-center justify-center rounded-full"
				style="background: conic-gradient(#96D247 0 {pct}%, rgba(255,255,255,.14) {pct}% 100%)"
				role="img"
				aria-label="{pct}% compleet"
			>
				<div class="flex size-[74px] flex-col items-center justify-center rounded-full bg-sidebar">
					<span class="font-display text-[22px] font-bold leading-none text-sidebar-primary">{pct}%</span>
					<span class="mt-0.5 text-[10px] text-sidebar-foreground">compleet</span>
				</div>
			</div>
			<p class="max-w-[150px] text-[13px] leading-snug text-sidebar-foreground">{hint}</p>
		</div>
	</div>
</section>
