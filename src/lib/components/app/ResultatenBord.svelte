<script lang="ts">
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR } from '$lib/trigger-map';
	import type { GroepResultaat, Oordeel, Zekerheid } from '$lib/resultaten';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Check from '@lucide/svelte/icons/check';
	import OctagonX from '@lucide/svelte/icons/octagon-x';
	import Clock from '@lucide/svelte/icons/clock';

	/**
	 * Resultaten-scorebord: per testgroep wie leidt, hoe zeker dat is, wat er nog ontbreekt en wat je
	 * beter kunt stoppen. Alles is advies — de winnaar markeer je zelf (met één klik).
	 */
	let {
		groepen,
		onWinnaar
	}: { groepen: GroepResultaat[]; onWinnaar: (conceptId: string) => void } = $props();

	const metCijfers = $derived(groepen.filter((g) => g.status !== 'geen_data'));
	const wachtend = $derived(groepen.filter((g) => g.status === 'geen_data'));

	const STATUS: Record<GroepResultaat['status'], { tekst: string; cls: string }> = {
		klaar: { tekst: 'Klaar om te beslissen', cls: 'bg-brand-lime text-brand-green' },
		loopt: { tekst: 'Loopt nog', cls: 'bg-muted text-muted-foreground' },
		winnaar: { tekst: 'Beslist', cls: 'bg-brand-green text-white' },
		geen_data: { tekst: 'Wacht op cijfers', cls: 'bg-muted text-muted-foreground' }
	};
	const OORDEEL: Record<Oordeel, { tekst: string; cls: string }> = {
		winnaar: { tekst: 'Winnaar', cls: 'bg-brand-green text-white' },
		leidt: { tekst: 'Leidt', cls: 'bg-brand-mint text-brand-green' },
		achter: { tekst: 'Achter', cls: 'bg-muted text-muted-foreground' },
		stop: { tekst: 'Stop-advies', cls: 'bg-[#FEF0E8] text-[#B8410C]' },
		te_vroeg: { tekst: 'Te vroeg', cls: 'border border-dashed text-muted-foreground' },
		geen_data: { tekst: 'Geen cijfer', cls: 'border border-dashed text-muted-foreground' }
	};
	const ZEKER: Record<Zekerheid, { tekst: string; cls: string }> = {
		zeker: { tekst: '95% zeker', cls: 'bg-brand-green text-white' },
		waarschijnlijk: { tekst: '~80% zeker', cls: 'bg-brand-mint text-brand-green' },
		te_vroeg: { tekst: 'Nog te vroeg', cls: 'bg-muted text-muted-foreground' }
	};
</script>

<section
	class="space-y-3"
	data-tour-order="2"
	data-tour-title="Resultaten per testgroep"
	data-tour-text="Hier zie je per testgroep wie er leidt, hoe zeker dat is en wat er nog ontbreekt voor een betrouwbare uitslag. Varianten die ver achterlopen krijgen een stop-advies. Het is altijd een advies: jij markeert de winnaar."
>
	<div>
		<h3 class="font-display text-xl font-bold text-brand-green">Resultaten per testgroep</h3>
		<p class="text-sm text-muted-foreground">
			Een testgroep vergelijkt varianten binnen dezelfde bewustzijnsfase. Alles hier is advies; er wordt nooit
			vanzelf iets gestopt of gemarkeerd.
		</p>
	</div>

	{#if metCijfers.length === 0}
		<div class="rounded-[22px] border border-dashed bg-card px-5 py-6 text-center text-sm text-muted-foreground">
			Nog geen resultaten. Koppel Meta of vul hieronder de cijfers per concept in, dan verschijnt hier de stand.
		</div>
	{/if}

	{#each metCijfers as g (g.sleutel)}
		{@const hoogste = Math.max(...g.leden.map((l) => l.waarde ?? 0), 0.0001)}
		<div class={cn('rounded-[24px] border bg-card p-5', g.status === 'klaar' && 'border-brand-lime shadow-[0_8px_24px_rgba(150,210,71,0.18)]')}>
			<div class="flex flex-wrap items-center gap-2">
				<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[g.fase])}>{g.fase}</span>
				<span class="text-[12px] text-muted-foreground">Test: {g.variabele}{g.metricLabel ? ` · vergeleken op ${g.metricLabel}` : ''}</span>
				<span class={cn('ml-auto rounded-full px-3 py-1 text-[11.5px] font-semibold', STATUS[g.status].cls)}>{STATUS[g.status].tekst}</span>
			</div>

			<div class="mt-3 flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<p class="font-display text-lg font-bold leading-snug">{g.kopregel}</p>
					<p class="mt-0.5 text-[13px] text-muted-foreground">{g.uitleg}</p>
				</div>
				{#if g.zekerheid}
					<span class={cn('shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold', ZEKER[g.zekerheid].cls)} title="Hoe zeker is het verschil met de nummer twee?">{ZEKER[g.zekerheid].tekst}</span>
				{/if}
			</div>

			<div class="mt-4 space-y-2.5">
				{#each g.leden as l (l.id)}
					<div class="rounded-[16px] bg-[#FAFCFB] px-3.5 py-3">
						<div class="flex flex-wrap items-center gap-2.5">
							<span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold" title={l.naam}>{l.naam}</span>
							<span class="text-[13.5px] font-bold tabular-nums text-brand-green">{l.waardeLabel}</span>
							<span class={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', OORDEEL[l.oordeel].cls)}>
								{#if l.oordeel === 'winnaar'}<Trophy class="size-3" />{:else if l.oordeel === 'stop'}<OctagonX class="size-3" />{:else if l.oordeel === 'te_vroeg'}<Clock class="size-3" />{/if}
								{OORDEEL[l.oordeel].tekst}
							</span>
						</div>
						{#if l.waarde != null}
							<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									class={cn('h-full rounded-full', l.oordeel === 'stop' ? 'bg-brand-orange' : l.oordeel === 'achter' || l.oordeel === 'te_vroeg' ? 'bg-[#B9C6BF]' : 'bg-brand-action')}
									style="width:{Math.max(2, ((l.waarde ?? 0) / hoogste) * 100)}%"
								></div>
							</div>
						{/if}
						{#if l.reden}<p class="mt-1.5 text-[12px] text-muted-foreground">{l.reden}</p>{/if}
						{#if l.voortgang && l.oordeel !== 'winnaar'}
							<p class="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px]">
								{#each l.voortgang as v (v.label)}
									<span class={cn('inline-flex items-center gap-1', v.ok ? 'text-brand-green' : 'text-muted-foreground')}>
										{#if v.ok}<Check class="size-3" strokeWidth={3} />{/if}{v.label}: {v.tekst}
									</span>
								{/each}
							</p>
						{:else if l.handmatig && l.waarde != null}
							<p class="mt-1.5 text-[11.5px] text-muted-foreground">Handmatig ingevoerd — geen automatische drempelcontrole.</p>
						{/if}
					</div>
				{/each}
			</div>

			{#if g.status === 'klaar' && g.leiderId}
				{@const leider = g.leden.find((l) => l.id === g.leiderId)}
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button
						type="button"
						class="inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#00432E] motion-reduce:hover:translate-y-0"
						onclick={() => g.leiderId && onWinnaar(g.leiderId)}
					>
						<Trophy class="size-4" /> Markeer "{leider?.naam}" als winnaar
					</button>
					<span class="text-[12px] text-muted-foreground">Dit zet de invalshoek op "Getest — werkt". De vervolgronde blijft een eigen keuze.</span>
				</div>
			{/if}
		</div>
	{/each}

	{#if wachtend.length}
		<p class="text-[12.5px] text-muted-foreground">
			Wachten nog op cijfers: {wachtend.map((g) => `${g.fase} (${g.leden.length})`).join(' · ')}
		</p>
	{/if}
</section>
