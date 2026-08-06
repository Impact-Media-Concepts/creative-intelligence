<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import X from '@lucide/svelte/icons/x';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';

	let { open = $bindable(false), onSluiten }: { open?: boolean; onSluiten?: () => void } = $props();

	interface Stap {
		titel: string;
		intro: string;
		punten: string[];
	}

	const STAPPEN: Stap[] = [
		{
			titel: 'Welkom bij Creative Intelligence',
			intro:
				'Deze tool brengt je van klant-input naar een compleet, getest creatief plan — via de "Creative Loop". In een paar stappen laten we zien hoe het werkt.',
			punten: [
				'Per klant een eigen omgeving met alle fasen.',
				'AI ondersteunt elke stap; jij houdt de regie (goedkeuren/bijsturen).',
				'Je kunt deze rondleiding altijd opnieuw openen via de knop in de zijbalk.'
			]
		},
		{
			titel: '1. Overzicht & de Creative Loop',
			intro:
				'Op de klantpagina zie je bovenaan de Creative Loop-ring en een reis-dashboard.',
			punten: [
				'Het dashboard toont per fase de voortgang.',
				'De kaart "Volgende stap" wijst je steeds de logische vervolgactie.',
				'De ring-stappen zijn klikbaar — spring direct naar een fase.'
			]
		},
		{
			titel: '2. Intake — de basis',
			intro:
				'Alles begint met een goede intake. Hoe vollediger, hoe sterker de rest. Er zijn 6 bronnen.',
			punten: [
				'Klantgesprek, interne interviews, concurrentie, reviews, eigen data en "overig".',
				'Upload documenten (PDF, Excel, afbeelding) — de tool verdeelt de inhoud automatisch over de juiste bronnen.',
				'Reeds ingevulde velden worden aangevuld, niet overschreven.'
			]
		},
		{
			titel: '3. Trigger Map — het klantbeeld',
			intro:
				'Claude distilleert de intake tot een helder klantbeeld dat de basis vormt voor je tests.',
			punten: [
				'Pijnpunten, wensen, bezwaren, taal van de doelgroep en persona’s.',
				'De invalshoeken (wat je gaat testen) verschijnen — automatisch geprioriteerd (RICE) — in de matrix.',
				'Bewerk vrij; een nieuwe generatie maakt een nieuwe versie (oude blijft bewaard).'
			]
		},
		{
			titel: '4. Plan van aanpak & Matrix',
			intro:
				'Vóór de matrix stem je de teststrategie af met de AI Content Strategy Expert — zodat je achteraf niets meer hoeft te tweaken.',
			punten: [
				'Kies (optioneel) persona’s, funnellagen, beschikbare middelen en je doel/KPI.',
				'De AI stelt een plan voor (met onderbouwing); geef feedback en keur goed.',
				'Daarna rollen matrix én testplan consistent uit — schoon testen: één variabele per test.',
				'Sleep rijen om de testvolgorde te bepalen.'
			]
		},
		{
			titel: '5. Brief',
			intro:
				'Per concept genereer je een productieklare creative brief voor je creator.',
			punten: [
				'De brief past zich aan het format aan (video, statisch, carousel).',
				'Kopieer naar het klembord of exporteer als bestand voor je creator.'
			]
		},
		{
			titel: '6. Sprint & Learnings',
			intro:
				'Je voert de resultaten in, bepaalt de winnaar en legt de learnings vast — de loop sluit zich.',
			punten: [
				'Vul metrics in (hook rate, CTR, ROAS, CPA) en laat Claude de learning bepalen.',
				'Markeer een winnaar → de bijbehorende invalshoek wordt "Getest — werkt".',
				'De Learnings-tab voedt automatisch de volgende ronde — zo wordt elke ronde slimmer.'
			]
		},
		{
			titel: 'Klaar!',
			intro: 'Je kent nu de hele Creative Loop. Nog een paar handige weetjes:',
			punten: [
				'AI-taken lopen gewoon door als je naar een ander tabje gaat (indicator rechtsonder).',
				'Volg de "Volgende stap"-kaart op het overzicht als je even niet weet wat te doen.',
				'Deze rondleiding staat altijd klaar via de knop in de zijbalk.'
			]
		}
	];

	let i = $state(0);
	// Reset naar de eerste stap telkens als de rondleiding opent.
	$effect(() => {
		if (open) i = 0;
	});

	let laatste = $derived(i === STAPPEN.length - 1);

	function sluit() {
		open = false;
		onSluiten?.();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
		role="button"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) sluit();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') sluit();
		}}
	>
		<div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-5 py-3.5">
				<div class="flex items-center gap-2">
					<span class="text-[11px] font-semibold uppercase tracking-widest text-brand-green">
						Rondleiding
					</span>
					<span class="text-xs text-muted-foreground">Stap {i + 1} / {STAPPEN.length}</span>
				</div>
				<button
					type="button"
					onclick={sluit}
					class="rounded-md p-1 text-muted-foreground hover:bg-muted"
					aria-label="Sluiten"
				>
					<X class="size-4" />
				</button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-5 py-5">
				<h2 class="text-lg font-semibold text-foreground">{STAPPEN[i].titel}</h2>
				<p class="mt-1.5 text-sm text-muted-foreground">{STAPPEN[i].intro}</p>
				<ul class="mt-4 space-y-2">
					{#each STAPPEN[i].punten as punt (punt)}
						<li class="flex gap-2.5 text-sm">
							<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-lime"></span>
							<span>{punt}</span>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Footer -->
			<div class="flex items-center justify-between gap-3 border-t px-5 py-3.5">
				<div class="flex gap-1.5">
					{#each STAPPEN as _, s (s)}
						<span class={cn('size-1.5 rounded-full', s === i ? 'bg-brand-green' : 'bg-border')}></span>
					{/each}
				</div>
				<div class="flex gap-2">
					{#if i > 0}
						<Button variant="ghost" size="sm" onclick={() => (i -= 1)}>
							<ArrowLeft class="size-4" />
							Vorige
						</Button>
					{/if}
					{#if laatste}
						<Button size="sm" onclick={sluit}>
							<Check class="size-4" />
							Aan de slag
						</Button>
					{:else}
						<Button size="sm" onclick={() => (i += 1)}>
							Volgende
							<ArrowRight class="size-4" />
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
