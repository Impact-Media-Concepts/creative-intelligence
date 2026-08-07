<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import X from '@lucide/svelte/icons/x';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';

	// base = "/klanten/{id}" (of null als er geen klant is). onSluiten wordt bij afsluiten aangeroepen.
	let { open = $bindable(false), base, onSluiten }: {
		open?: boolean;
		base: string | null;
		onSluiten?: () => void;
	} = $props();

	/**
	 * De secties (routes) die de tour langsloopt. Nieuwe secties → hier toevoegen.
	 * De STAPPEN per sectie worden automatisch ontdekt uit de DOM: elk element met
	 * data-tour-title (+ data-tour-text, optioneel data-tour-order) wordt een spotlight-stap.
	 * Dus een nieuwe functie annoteren = 'm automatisch in de rondleiding opnemen.
	 */
	const SECTIE_SUBS: { label: string; sub: string }[] = [
		{ label: 'Overzicht', sub: '' },
		{ label: 'Intake', sub: '/intake' },
		{ label: 'Trigger Map', sub: '/triggermap' },
		{ label: 'Matrix', sub: '/matrix' },
		{ label: 'Brief', sub: '/brief' },
		{ label: 'Sprint', sub: '/sprint' },
		{ label: 'Learnings', sub: '/learnings' }
	];

	interface Stap {
		titel: string;
		tekst: string;
		el: HTMLElement | null;
	}

	let actief = $state(false);
	let sectieIdx = $state(0);
	let stapIdx = $state(0);
	let stappen = $state<Stap[]>([]);
	let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);

	let secties = $derived(base ? SECTIE_SUBS.map((s) => ({ label: s.label, pad: base + s.sub })) : []);
	let huidige = $derived(stappen[stapIdx] ?? null);
	let laatste = $derived(sectieIdx >= secties.length - 1 && stapIdx >= stappen.length - 1);
	let eerste = $derived(sectieIdx === 0 && stapIdx === 0);

	$effect(() => {
		if (open && !actief && base) start();
		if (!open && actief) actief = false;
	});

	async function start() {
		actief = true;
		await laadSectie(0, 'vooruit');
	}

	async function laadSectie(idx: number, richting: 'vooruit' | 'terug') {
		if (idx < 0) return;
		if (idx >= secties.length) return klaar();
		sectieIdx = idx;
		rect = null;
		await goto(secties[idx].pad, { noScroll: true }).catch(() => {});
		await tick();
		await wacht(220); // laat de pagina + data renderen
		const els = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-title]')).filter(
			(el) => el.offsetParent !== null
		);
		els.sort(
			(a, b) =>
				Number(a.getAttribute('data-tour-order') ?? '0') -
				Number(b.getAttribute('data-tour-order') ?? '0')
		);
		stappen = els.map((el) => ({
			titel: el.getAttribute('data-tour-title') ?? '',
			tekst: el.getAttribute('data-tour-text') ?? '',
			el
		}));
		if (stappen.length === 0) {
			// Lege sectie → automatisch overslaan.
			return laadSectie(richting === 'vooruit' ? idx + 1 : idx - 1, richting);
		}
		stapIdx = richting === 'vooruit' ? 0 : stappen.length - 1;
		await toon();
	}

	async function toon() {
		const el = stappen[stapIdx]?.el;
		if (!el) {
			rect = null;
			return;
		}
		el.scrollIntoView({ block: 'center', behavior: 'smooth' });
		await wacht(320);
		meet();
	}

	function meet() {
		const el = stappen[stapIdx]?.el;
		if (!el) {
			rect = null;
			return;
		}
		const r = el.getBoundingClientRect();
		rect = { top: r.top, left: r.left, width: r.width, height: r.height };
	}

	async function volgende() {
		if (stapIdx < stappen.length - 1) {
			stapIdx++;
			await toon();
		} else {
			await laadSectie(sectieIdx + 1, 'vooruit');
		}
	}
	async function vorige() {
		if (stapIdx > 0) {
			stapIdx--;
			await toon();
		} else if (sectieIdx > 0) {
			await laadSectie(sectieIdx - 1, 'terug');
		}
	}
	function klaar() {
		actief = false;
		open = false;
		onSluiten?.();
	}
	function wacht(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	// Spotlight herberekenen bij scroll/resize.
	$effect(() => {
		if (!actief) return;
		const h = () => meet();
		window.addEventListener('resize', h);
		window.addEventListener('scroll', h, true);
		return () => {
			window.removeEventListener('resize', h);
			window.removeEventListener('scroll', h, true);
		};
	});

	// Tooltip links geklemd binnen het scherm; boven of onder het element.
	let tipLeft = $derived(
		rect ? Math.min(Math.max(12, rect.left), (globalThis.innerWidth ?? 1200) - 372) : 0
	);
	let tipBoven = $derived(
		rect ? (globalThis.innerHeight ?? 800) - (rect.top + rect.height) < 240 : false
	);
</script>

{#if actief}
	<!-- Klik-blocker (interactie uit tijdens de tour) -->
	<div class="fixed inset-0 z-[70]" aria-hidden="true"></div>

	{#if rect}
		<!-- Spotlight rond het element -->
		<div
			class="pointer-events-none fixed z-[71] rounded-lg ring-2 ring-brand-lime transition-all duration-200"
			style="top:{rect.top - 6}px; left:{rect.left - 6}px; width:{rect.width + 12}px; height:{rect.height + 12}px; box-shadow:0 0 0 9999px rgba(0,0,0,0.55);"
		></div>
	{:else}
		<div class="pointer-events-none fixed inset-0 z-[71] bg-black/55"></div>
	{/if}

	<!-- Tooltip -->
	<div
		class="fixed z-[72] w-[360px] max-w-[calc(100vw-24px)] rounded-xl border bg-background p-4 shadow-xl"
		style={rect
			? tipBoven
				? `bottom:${(globalThis.innerHeight ?? 800) - rect.top + 12}px; left:${tipLeft}px;`
				: `top:${rect.top + rect.height + 12}px; left:${tipLeft}px;`
			: 'top:50%; left:50%; transform:translate(-50%,-50%);'}
	>
		<div class="mb-2 flex items-center justify-between">
			<span class="text-[11px] font-semibold uppercase tracking-widest text-brand-green">
				{secties[sectieIdx]?.label ?? 'Rondleiding'}
			</span>
			<div class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">
					{secties.length ? `${sectieIdx + 1}/${secties.length}` : ''}
				</span>
				<button
					type="button"
					onclick={klaar}
					class="rounded-md p-0.5 text-muted-foreground hover:bg-muted"
					aria-label="Rondleiding sluiten"
				>
					<X class="size-4" />
				</button>
			</div>
		</div>

		{#if huidige}
			<h3 class="text-base font-semibold text-foreground">{huidige.titel}</h3>
			{#if huidige.tekst}
				<p class="mt-1 text-sm text-muted-foreground">{huidige.tekst}</p>
			{/if}
		{:else}
			<h3 class="text-base font-semibold text-foreground">Rondleiding</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				{base
					? 'Even laden…'
					: 'Open eerst een klant (of maak er een aan) om de rondleiding door de fasen te starten.'}
			</p>
		{/if}

		<div class="mt-4 flex items-center justify-between gap-3">
			{#if stappen.length > 1}
				<div class="flex gap-1">
					{#each stappen as _, s (s)}
						<span class={cn('size-1.5 rounded-full', s === stapIdx ? 'bg-brand-green' : 'bg-border')}></span>
					{/each}
				</div>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				{#if !eerste}
					<Button variant="ghost" size="sm" onclick={vorige}>
						<ArrowLeft class="size-4" /> Vorige
					</Button>
				{/if}
				{#if laatste}
					<Button size="sm" onclick={klaar}>
						<Check class="size-4" /> Klaar
					</Button>
				{:else}
					<Button size="sm" onclick={volgende}>
						Volgende <ArrowRight class="size-4" />
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}
