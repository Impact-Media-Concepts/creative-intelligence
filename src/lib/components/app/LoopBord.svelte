<script lang="ts">
	import { cn } from '$lib/utils';
	import { loopRondIsAf, type LoopStap } from '$lib/loop';
	import Check from '@lucide/svelte/icons/check';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';

	/**
	 * De loop als bord: vijf stappen, één is aan de beurt. Alles wat klaar is staat vol, wat wacht is gedempt.
	 * Onder de stappen loopt een pijl terug: elke ronde begint met wat je leerde.
	 */
	let { stappen, base }: { stappen: LoopStap[]; base: string } = $props();

	const af = $derived(loopRondIsAf(stappen));
</script>

<section
	class="space-y-3"
	data-tour-order="3"
	data-tour-title="De loop"
	data-tour-text="Dit is het hele proces in vijf stappen: Begrijpen, Bepalen, Maken, Testen en Leren. Wat klaar is staat groen, de stap die aan de beurt is licht op en wat volgt wacht. Klik op een stap om erheen te gaan."
>
	<div class="flex items-end justify-between gap-3">
		<div>
			<h2 class="font-display text-xl font-bold text-brand-green">De loop</h2>
			<p class="text-sm text-muted-foreground">Vijf stappen, steeds opnieuw. Eén stap is aan de beurt.</p>
		</div>
	</div>

	<ol class="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-0">
		{#each stappen as s, i (s.sleutel)}
			<li class="relative lg:px-1.5">
				<a
					href="{base}{s.pad}"
					class={cn(
						'group block h-full rounded-[22px] border p-4 transition-all hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
						s.status === 'nu' &&
							'border-brand-lime bg-card shadow-[0_8px_24px_rgba(150,210,71,0.22)]',
						s.status === 'klaar' && 'border-[#BFE3D2] bg-brand-mint/50 hover:bg-brand-mint',
						s.status === 'later' && 'border-dashed bg-card/60 text-muted-foreground hover:bg-card'
					)}
				>
					<div class="flex items-center gap-2.5">
						<span
							class={cn(
								'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
								s.status === 'klaar' && 'bg-brand-green text-white',
								s.status === 'nu' && 'bg-brand-lime text-brand-green',
								s.status === 'later' && 'bg-muted text-muted-foreground'
							)}
						>
							{#if s.status === 'klaar'}<Check class="size-4" strokeWidth={3} />{:else}{s.nummer}{/if}
						</span>
						<span
							class={cn(
								'font-display text-lg font-bold leading-none',
								s.status === 'later' ? 'text-muted-foreground' : 'text-brand-green'
							)}>{s.naam}</span
						>
					</div>

					<p class="mt-3 text-[13px] leading-snug {s.status === 'later' ? '' : 'text-foreground'}">{s.taak}</p>

					<p
						class={cn(
							'mt-3 text-[12px] font-semibold',
							s.status === 'later' ? 'text-muted-foreground' : 'text-brand-green'
						)}
					>
						{s.stand}
					</p>

					{#if s.status === 'nu'}
						<span
							class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors group-hover:bg-[#00432E]"
						>
							{s.actie}
							<ArrowRight class="size-3.5" />
						</span>
					{:else if s.status === 'klaar'}
						<span class="mt-3 inline-block text-[12px] font-medium text-brand-green/80">Klaar · bekijk</span>
					{/if}
				</a>

				{#if i < stappen.length - 1}
					<ArrowRight
						class="pointer-events-none absolute right-[-9px] top-[40px] z-10 hidden size-4 text-brand-green/50 lg:block"
					/>
				{/if}
			</li>
		{/each}
	</ol>

	<!-- De terugkoppeling: Leren voedt de volgende ronde -->
	<div class="relative hidden h-12 lg:block" aria-hidden="true">
		<div
			class={cn(
				'absolute inset-x-[10%] top-0 h-7 rounded-b-[18px] border-x-2 border-b-2 border-dashed',
				af ? 'border-brand-lime' : 'border-[#BFE3D2]'
			)}
		></div>
		<!-- pijlpunt omhoog, bij stap 1 -->
		<span
			class={cn(
				'absolute left-[10%] top-[1px] -translate-x-[8px] -translate-y-px border-x-[7px] border-b-[10px] border-x-transparent',
				af ? 'border-b-brand-lime' : 'border-b-[#BFE3D2]'
			)}
		></span>
		<span
			class={cn(
				'absolute left-1/2 top-3.5 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold',
				af ? 'bg-brand-lime text-brand-green' : 'bg-card text-muted-foreground'
			)}
		>
			<RotateCw class="size-3.5" />
			{af ? 'Ronde klaar — start de volgende met wat je leerde' : 'Elke ronde begint met wat je leerde'}
		</span>
	</div>

	<p class="flex items-center gap-1.5 text-[12px] text-muted-foreground lg:hidden">
		<RotateCw class="size-3.5" />
		{af ? 'Ronde klaar — start de volgende met wat je leerde' : 'Elke ronde begint met wat je leerde'}
	</p>
</section>
