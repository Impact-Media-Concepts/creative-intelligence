<script lang="ts">
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils';

	export interface RailSectie {
		key: string;
		label: string;
		icoon: Component<{ class?: string }>;
		kleur: string;
		iconKleur: string;
		tint: string;
		aantal: number;
	}

	/** Voortgangsrail: één rij per sectie, met mini-balk (4 signalen = vol). */
	let {
		secties,
		actief,
		onKies
	}: { secties: RailSectie[]; actief: string; onKies: (key: string) => void } = $props();
</script>

<nav
	class="flex gap-1 overflow-x-auto rounded-[26px] border bg-card p-3.5 lg:sticky lg:top-5 lg:flex-col lg:overflow-visible"
	aria-label="Secties van de trigger map"
>
	<span class="hidden px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:block">Signalen</span>
	{#each secties as s (s.key)}
		{@const a = s.key === actief}
		<button
			type="button"
			class={cn(
				'flex shrink-0 items-center gap-2.5 rounded-[18px] px-3 py-2.5 text-left transition-colors hover:bg-muted lg:w-full',
				a && 'hover:brightness-[0.98]'
			)}
			style={a ? `background:${s.tint}` : ''}
			aria-current={a ? 'true' : undefined}
			onclick={() => onKies(s.key)}
		>
			<span
				class="flex size-[30px] shrink-0 items-center justify-center rounded-full"
				style={a ? `background:${s.kleur};color:${s.iconKleur}` : `background:#F1F6F2;color:${s.kleur}`}
			>
				<s.icoon class="size-[15px]" />
			</span>
			<span class="min-w-0 flex-1">
				<span class={cn('block whitespace-nowrap text-[13.5px] lg:whitespace-normal', a ? 'font-semibold' : 'text-[#3E4C45]')}>{s.label}</span>
				<span class="mt-1 hidden h-1 rounded-full bg-[#EDF2EE] lg:block">
					<span class="block h-1 rounded-full" style="width:{Math.min(s.aantal / 4, 1) * 100}%;background:{s.kleur}"></span>
				</span>
			</span>
			<span class="text-xs font-semibold" style="color:{a ? s.kleur : '#9AA8A0'}">{s.aantal}</span>
		</button>
	{/each}
</nav>
