<script lang="ts">
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR, bewustzijnVan } from '$lib/trigger-map';
	import { postJSON } from '$lib/saver.svelte';
	import { bladSoort, bouwScenes, leesScriptMetBeeld, referentieLink, splitProps } from '$lib/storyboard';
	import { SCRIPT_BEATS, type ScriptBeat } from '$lib/productie';
	import type { Brief } from '$lib/sprint';
	import Zap from '@lucide/svelte/icons/zap';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import Smile from '@lucide/svelte/icons/smile';
	import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	interface BladConcept {
		id: string;
		invalshoek: string | null;
		aanbod: string | null;
		funnelfase: 'TOFU' | 'MOFU' | 'BOFU' | null;
		awareness: string | null;
		format: string | null;
		structuur: string | null;
		creator_type: string | null;
		hook?: string | null;
		brief: unknown;
		script: unknown;
		referentie: string | null;
		props: string | null;
	}

	let {
		concept,
		merknaam,
		base,
		toonLinks = true,
		onBeeld
	}: {
		concept: BladConcept;
		merknaam: string;
		base: string;
		/** Verberg de doorverwijzingen naar de Creatie-tab als dit blad al in die tab staat. */
		toonLinks?: boolean;
		/** Meldt de beeldaanwijzingen terug (na opslaan of genereren), zodat de pagina eromheen synchroon blijft. */
		onBeeld?: (b: Partial<Record<ScriptBeat, string>>) => void;
	} = $props();

	const fase = $derived(bewustzijnVan(concept));
	const soort = $derived(bladSoort(concept.format));
	// svelte-ignore state_referenced_locally
	const start = leesScriptMetBeeld(concept.script);
	// svelte-ignore state_referenced_locally
	let beeld = $state<Partial<Record<ScriptBeat, string>>>({ ...(start?.beeld ?? {}) });
	let bezig = $state(false);
	let fout = $state<string | null>(null);

	const script = $derived(leesScriptMetBeeld(concept.script));
	// Wijzigingen van buitenaf (bv. "maak alles" in de Creatie-tab) komen hier ook binnen.
	$effect(() => {
		beeld = { ...(script?.beeld ?? {}) };
	});
	const scenes = $derived(script ? bouwScenes(script, soort, beeld) : []);
	const brief = $derived(concept.brief && typeof concept.brief === 'object' ? (concept.brief as Partial<Brief>) : null);
	const benodigdheden = $derived(splitProps(concept.props));
	const link = $derived(referentieLink(concept.referentie));
	const heeftBeeld = $derived(scenes.some((s) => s.beeld));

	const VLAK: Record<string, string> = {
		Onbewust: 'linear-gradient(165deg,#EAF2FB,#CFE0F4)',
		Probleembewust: 'linear-gradient(165deg,#FEF0E8,#F7D2BC)',
		Oplossingsbewust: 'linear-gradient(165deg,#EAF5EF,#BFE3D2)',
		Productbewust: 'linear-gradient(165deg,#F4FAE8,#DCEBBE)',
		'Meest bewust': 'linear-gradient(165deg,#DCF3EA,#9ED6BE)'
	};
	const ICOON = { hook: Zap, probleem: CircleAlert, oplossing: Lightbulb, resultaat: Smile, cta: MousePointerClick } as const;

	function leesFout(e: unknown): string {
		const ruw = e instanceof Error ? e.message : 'Er ging iets mis';
		try {
			const j = JSON.parse(ruw);
			if (j?.message) return String(j.message);
		} catch {
			// geen JSON
		}
		return ruw;
	}

	async function bewaar() {
		if (!script) return;
		fout = null;
		try {
			await postJSON('/api/concepts', {
				type: 'script_save',
				id: concept.id,
				script: { ...script, beeld }
			});
			onBeeld?.({ ...beeld });
		} catch (e) {
			fout = leesFout(e);
		}
	}

	async function genereer() {
		bezig = true;
		fout = null;
		try {
			const res = await postJSON<{ beeld: Record<ScriptBeat, string> }>(
				'/api/concepts',
				{ type: 'beeld_gen', id: concept.id },
				{ taak: 'Beeldaanwijzing maken' }
			);
			beeld = { ...res.beeld };
			onBeeld?.({ ...beeld });
		} catch (e) {
			fout = leesFout(e);
		} finally {
			bezig = false;
		}
	}

	const eyebrow = 'text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground';
</script>

<article
	id="c-{concept.id}"
	class="scroll-mt-6 break-inside-avoid rounded-[26px] border bg-card p-5 print:break-after-page print:rounded-none print:border-0 print:p-0"
>
	<header class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-1.5">
				<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[fase])}>{fase}</span>
				{#each [concept.format, concept.structuur, concept.creator_type, concept.aanbod] as chip, i (i)}
					{#if chip}<span class="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">{chip}</span>{/if}
				{/each}
			</div>
			<h3 class="mt-2 font-display text-xl font-bold leading-snug text-brand-green">{concept.invalshoek || '(geen invalshoek)'}</h3>
			{#if concept.hook}<p class="mt-0.5 text-[13px] text-muted-foreground">Hook: {concept.hook}</p>{/if}
		</div>
		<div class="flex flex-wrap gap-2 print:hidden">
			{#if script}
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#00432E] disabled:opacity-60"
					onclick={genereer}
					disabled={bezig}
				>
					{#if bezig}<LoaderCircle class="size-3.5 animate-spin" /> Bezig…{:else}<Sparkles class="size-3.5" /> {heeftBeeld ? 'Opnieuw voorstellen' : 'Beeldaanwijzing voorstellen'}{/if}
				</button>
			{/if}
			{#if toonLinks}
				<a href="{base}/productie" class="inline-flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-[12.5px] font-semibold text-brand-green transition-colors hover:bg-brand-mint/50">
					Script aanpassen <ArrowRight class="size-3.5" />
				</a>
			{/if}
		</div>
	</header>

	{#if fout}<p class="mt-3 rounded-[14px] border border-[#F7D2BC] bg-[#FEF0E8] px-3.5 py-2.5 text-[13px] text-[#B8410C] print:hidden">{fout}</p>{/if}

	{#if !script}
		<div class="mt-4 rounded-[18px] border border-dashed px-5 py-8 text-center">
			<p class="font-display text-base font-bold text-brand-green">Nog geen script</p>
			<p class="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">Het storyboard bouwt op het script. Schrijf of genereer dat eerst in de Creatie-tab.</p>
			{#if toonLinks}
				<a href="{base}/productie" class="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-green px-4 py-2 text-[12.5px] font-semibold text-white print:hidden">Naar de creatie <ArrowRight class="size-3.5" /></a>
			{/if}
		</div>
	{:else}
		<!-- De scènes -->
		{#if soort === 'static'}
			<div class="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-[minmax(200px,260px)_1fr]">
				<div
					class="relative aspect-[4/5] w-full overflow-hidden rounded-[20px] border-[3px] border-brand-green/80"
					style="background:{VLAK[fase] ?? '#EEF2F0'}"
				>
					<span class="absolute left-2.5 top-2.5 rounded-full bg-white/85 px-2 py-0.5 text-[10.5px] font-bold text-brand-green">Eye-catcher</span>
					<p class="absolute inset-0 flex items-center justify-center px-6 text-center font-display text-[20px] font-bold leading-tight text-brand-green">{scenes[0].tekst || concept.hook || ''}</p>
				</div>
				<div class="space-y-3">
					{#each scenes as s (s.beat)}
						<div class="rounded-[16px] bg-[#FAFCFB] p-3">
							<p class={eyebrow}>{s.label}</p>
							{#if s.tekst}<p class="mt-1 text-[13px] leading-snug">“{s.tekst}”</p>{/if}
							<label class="mt-2 block">
								<span class="text-[11px] font-semibold text-muted-foreground">Wat zie je?</span>
								<textarea
									class="mt-0.5 block w-full resize-none rounded-[10px] border bg-white px-2.5 py-1.5 text-[12.5px] leading-snug [field-sizing:content] focus:outline-none focus:ring-2 focus:ring-brand-lime print:border-0 print:px-0"
									rows="1"
									placeholder="Compositie, kader, tekst in beeld…"
									bind:value={beeld[s.beat]}
									onblur={bewaar}
								></textarea>
							</label>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
				{#each scenes as s (s.beat)}
					{@const Icoon = ICOON[s.beat]}
					<div class="relative flex flex-col gap-2">
						<div
							class={cn(
								'relative w-full overflow-hidden rounded-[22px] border-[3px] border-brand-green/80',
								soort === 'video' ? 'aspect-[9/16]' : 'aspect-[4/5]'
							)}
							style="background:{VLAK[fase] ?? '#EEF2F0'}"
						>
							<span class="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-brand-green text-[11px] font-bold text-white">{s.nummer}</span>
							<span class="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-brand-green">{s.label}</span>
							<Icoon class="absolute left-1/2 top-[36%] size-12 -translate-x-1/2 -translate-y-1/2 text-brand-green/25" strokeWidth={1.6} />
							<div class="absolute inset-x-2 bottom-2 rounded-[14px] bg-white/90 px-2.5 py-2">
								{#if s.tekst}
									<p class="line-clamp-6 text-[11.5px] leading-snug">“{s.tekst}”</p>
								{:else}
									<p class="text-[11.5px] italic text-muted-foreground">Nog geen tekst</p>
								{/if}
							</div>
						</div>
						<label class="block">
							<span class="text-[11px] font-semibold text-muted-foreground">Wat zie je?</span>
							<textarea
								class="mt-0.5 block w-full resize-none rounded-[10px] border bg-white px-2.5 py-1.5 text-[12px] leading-snug [field-sizing:content] focus:outline-none focus:ring-2 focus:ring-brand-lime print:border-0 print:px-0"
								rows="2"
								placeholder="Kader, setting, handeling…"
								bind:value={beeld[s.beat]}
								onblur={bewaar}
							></textarea>
						</label>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Brief in een blik -->
		<div class="mt-5 grid grid-cols-1 gap-3 border-t pt-4 md:grid-cols-3">
			{#each [['Wie', brief?.wie], ['Gewenst gedrag', brief?.gedrag], ['Succes', brief?.succes]] as [titel, waarde] (titel)}
				<div>
					<p class={eyebrow}>{titel}</p>
					<p class="mt-0.5 text-[12.5px] leading-snug">{waarde || '—'}</p>
				</div>
			{/each}
		</div>
		{#if benodigdheden.length || concept.referentie}
			<div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
				{#if benodigdheden.length}
					<div class="flex flex-wrap items-center gap-1.5">
						<span class={eyebrow}>Props</span>
						{#each benodigdheden as p, i (i)}<span class="rounded-full border px-2.5 py-0.5 text-[11.5px]">{p}</span>{/each}
					</div>
				{/if}
				{#if concept.referentie}
					<div class="flex items-center gap-1.5">
						<span class={eyebrow}>Referentie</span>
						{#if link}
							<a href={link} target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-green underline">
								Bekijk <ExternalLink class="size-3" />
							</a>
						{:else}
							<span class="text-[12.5px]">{concept.referentie}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		<p class="mt-3 hidden text-[11px] text-muted-foreground print:block">{merknaam} · {SCRIPT_BEATS.length} scènes · {concept.format || 'format n.t.b.'}</p>
	{/if}
</article>
