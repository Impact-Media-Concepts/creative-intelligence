<script lang="ts">
	import { cn } from '$lib/utils';
	import { postJSON } from '$lib/saver.svelte';
	import { BEWUSTZIJN_FASEN, type Bewustzijn } from '$lib/trigger-map';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	/**
	 * Angle-raster: kies een paar verlangens uit de trigger map en een paar bewustzijnsfases, en
	 * laat de AI per vak één invalshoek voorstellen. Wat je aanvinkt wordt TOEGEVOEGD aan de
	 * invalshoeken (niets wordt overschreven).
	 */
	let {
		versieId,
		clientId,
		signalen,
		base,
		onSluiten,
		onToegevoegd
	}: {
		versieId: string;
		clientId: string;
		signalen: { pijnpunten: string[]; wensen: string[]; bezwaren: string[] };
		base: string;
		onSluiten: () => void;
		onToegevoegd?: () => void;
	} = $props();

	type Type = 'Pijnpunt' | 'Wens' | 'Bezwaar';
	interface Rij {
		type: Type;
		tekst: string;
	}
	interface Cel {
		rij: number;
		fase: Bewustzijn;
		naam: string;
		omschrijving: string;
		onderbouwing: string;
		aan: boolean;
	}

	const MAX_RIJEN = 6;
	const GROEPEN: Array<{ type: Type; label: string; kleur: string; sleutel: 'pijnpunten' | 'wensen' | 'bezwaren' }> = [
		{ type: 'Pijnpunt', label: 'Pijnpunten', kleur: 'bg-[#FEF0E8] text-[#B8410C] border-[#F7D2BC]', sleutel: 'pijnpunten' },
		{ type: 'Wens', label: 'Wensen', kleur: 'bg-[#F4FAE8] text-[#3E5A1A] border-[#DCEBBE]', sleutel: 'wensen' },
		{ type: 'Bezwaar', label: 'Bezwaren', kleur: 'bg-brand-mint text-brand-green border-[#BFE3D2]', sleutel: 'bezwaren' }
	];

	// Standaard de drie middelste fases: daar zit meestal het meeste te halen.
	let gekozenFases = $state<Bewustzijn[]>(['Probleembewust', 'Oplossingsbewust', 'Productbewust']);
	let gekozenRijen = $state<Rij[]>([]);
	let bezig = $state(false);
	let fout = $state<string | null>(null);

	// Resultaat (snapshot van de keuze op het moment van maken, zodat wijzigen de grid niet verschuift)
	let rasterRijen = $state<Rij[]>([]);
	let rasterFases = $state<Bewustzijn[]>([]);
	let cellen = $state<Cel[] | null>(null);
	let toegevoegd = $state<number | null>(null);
	let bezigToevoegen = $state(false);

	const sleutel = (r: Rij) => `${r.type}:${r.tekst}`;
	const isGekozen = (r: Rij) => gekozenRijen.some((g) => sleutel(g) === sleutel(r));
	function toggleRij(r: Rij) {
		if (isGekozen(r)) gekozenRijen = gekozenRijen.filter((g) => sleutel(g) !== sleutel(r));
		else if (gekozenRijen.length < MAX_RIJEN) gekozenRijen = [...gekozenRijen, r];
	}
	function toggleFase(f: Bewustzijn) {
		gekozenFases = gekozenFases.includes(f)
			? gekozenFases.filter((x) => x !== f)
			: BEWUSTZIJN_FASEN.map((x) => x.label).filter((x) => x === f || gekozenFases.includes(x));
	}

	const vakken = $derived(gekozenRijen.length * gekozenFases.length);
	const aantalAan = $derived(cellen?.filter((c) => c.aan).length ?? 0);

	// De server geeft fouten als JSON ({"message": "..."}) terug; toon alleen de tekst.
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

	async function maakRaster() {
		bezig = true;
		fout = null;
		toegevoegd = null;
		try {
			const rijen = [...gekozenRijen];
			const fases = BEWUSTZIJN_FASEN.map((f) => f.label).filter((f) => gekozenFases.includes(f));
			const res = await postJSON<{ cellen: Array<Omit<Cel, 'aan'>> }>(
				'/api/trigger-map',
				{ type: 'raster', clientId, versieId, rijen, fases },
				{ taak: 'Angle-raster maken' }
			);
			rasterRijen = rijen;
			rasterFases = fases;
			cellen = res.cellen.map((c) => ({ ...c, aan: true }));
		} catch (e) {
			fout = leesFout(e);
		} finally {
			bezig = false;
		}
	}

	async function voegToe() {
		if (!cellen) return;
		bezigToevoegen = true;
		fout = null;
		try {
			const nieuw = cellen
				.filter((c) => c.aan && c.naam.trim())
				.map((c) => ({
					naam: c.naam,
					omschrijving: c.omschrijving,
					onderbouwing: c.onderbouwing,
					bewustzijn: c.fase
				}));
			const res = await postJSON<{ toegevoegd: number }>(
				'/api/trigger-map',
				{ type: 'invalshoeken_toevoegen', versieId, nieuw },
				{ taak: 'Invalshoeken toevoegen', ververs: true }
			);
			toegevoegd = res.toegevoegd;
			cellen = null;
			onToegevoegd?.();
		} catch (e) {
			fout = leesFout(e);
		} finally {
			bezigToevoegen = false;
		}
	}

	const celVan = (rij: number, fase: Bewustzijn) => cellen?.find((c) => c.rij === rij && c.fase === fase);
	const kort = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
	const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground';
</script>

<div class="mt-4 rounded-[22px] border border-[#D6ECE2] bg-[#EAF5EF] p-5">
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-display text-lg font-bold text-brand-green">Nieuwe invalshoeken bedenken</p>
			<p class="mt-0.5 text-[13px] text-muted-foreground">
				Zelfde verlangen, andere ingang. Kies waar je op wilt inspelen en voor wie (welke fase) — de
				AI doet per vak een voorstel. Jij kiest wat erin gaat.
			</p>
		</div>
		<button
			type="button"
			aria-label="Sluiten"
			class="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white"
			onclick={onSluiten}
		>
			<X class="size-4" />
		</button>
	</div>

	{#if toegevoegd !== null}
		<div class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-brand-lime px-4 py-3">
			<span class="flex items-center gap-2 text-sm font-semibold text-brand-green">
				<Check class="size-4" strokeWidth={2.6} />
				{toegevoegd} {toegevoegd === 1 ? 'invalshoek' : 'invalshoeken'} toegevoegd — ze staan nu hierboven.
			</span>
			<span class="text-[13px] text-brand-green">
				Nog geen score: stel die voor via
				<a href="{base}/matrix" class="font-semibold underline">Scores opnieuw voorstellen</a> in de matrix.
			</span>
		</div>
	{/if}

	{#if cellen === null}
		<!-- Stap 1: verlangens -->
		<div class="mt-5">
			<p class={eyebrow}>1 · Waar wil je op inspelen? <span class="ml-1 normal-case tracking-normal">({gekozenRijen.length}/{MAX_RIJEN})</span></p>
			<div class="mt-2.5 space-y-3">
				{#each GROEPEN as g (g.type)}
					{#if signalen[g.sleutel].length}
						<div>
							<p class="mb-1.5 text-xs font-semibold text-muted-foreground">{g.label}</p>
							<div class="flex flex-wrap gap-2">
								{#each signalen[g.sleutel] as tekst (tekst)}
									{@const r = { type: g.type, tekst }}
									{@const aan = isGekozen(r)}
									<button
										type="button"
										title={tekst}
										class={cn(
											'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] transition-all hover:-translate-y-px motion-reduce:hover:translate-y-0',
											aan ? 'border-brand-green bg-brand-green font-semibold text-white' : cn(g.kleur, 'hover:shadow-sm'),
											!aan && gekozenRijen.length >= MAX_RIJEN && 'cursor-not-allowed opacity-50'
										)}
										onclick={() => toggleRij(r)}
									>
										{#if aan}<Check class="size-3.5 shrink-0" strokeWidth={3} />{/if}
										<span class="truncate">{kort(tekst, 70)}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Stap 2: fases -->
		<div class="mt-5">
			<p class={eyebrow}>2 · Voor wie? (bewustzijnsfase)</p>
			<div class="mt-2.5 flex flex-wrap gap-2">
				{#each BEWUSTZIJN_FASEN as f (f.label)}
					{@const aan = gekozenFases.includes(f.label)}
					<button
						type="button"
						title={f.uitleg}
						class={cn(
							'rounded-2xl border px-3.5 py-2 text-left transition-all hover:-translate-y-px motion-reduce:hover:translate-y-0',
							aan ? 'border-brand-green bg-white shadow-sm' : 'border-transparent bg-white/60 text-muted-foreground'
						)}
						onclick={() => toggleFase(f.label)}
					>
						<span class="flex items-center gap-1.5 text-[13px] font-semibold">
							<span class={cn('size-2 rounded-full', aan ? 'bg-brand-action' : 'bg-[#C7D2CB]')}></span>{f.label}
						</span>
						<span class="mt-0.5 block text-[11.5px] text-muted-foreground">{f.taak}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if fout}
			<p class="mt-4 flex items-start gap-2 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
				<TriangleAlert class="mt-0.5 size-4 shrink-0" />{fout}
			</p>
		{/if}

		<div class="mt-5 flex flex-wrap items-center gap-3">
			<button
				type="button"
				disabled={bezig || vakken === 0}
				class="inline-flex items-center gap-2 rounded-full bg-brand-action px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#2AA376] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:hover:translate-y-0"
				onclick={maakRaster}
			>
				{#if bezig}<LoaderCircle class="size-4 animate-spin" />{:else}<Sparkles class="size-4" />{/if}
				{bezig ? 'Raster maken… (even geduld)' : vakken ? `Maak het raster (${vakken} ${vakken === 1 ? 'vak' : 'vakken'})` : 'Kies verlangens en fases'}
			</button>
			<span class="text-[12.5px] text-muted-foreground">Duurt ongeveer een minuut. Er wordt nog niets opgeslagen.</span>
		</div>
	{:else}
		<!-- Resultaat: het raster -->
		<div class="mt-5 overflow-x-auto">
			<div
				class="grid min-w-[640px] gap-2.5"
				style="grid-template-columns: minmax(140px, 0.8fr) repeat({rasterFases.length}, minmax(190px, 1fr))"
			>
				<div></div>
				{#each rasterFases as f (f)}
					<div class="px-1">
						<p class="text-[13px] font-semibold text-brand-green">{f}</p>
						<p class="text-[11.5px] text-muted-foreground">{BEWUSTZIJN_FASEN.find((x) => x.label === f)?.taak}</p>
					</div>
				{/each}

				{#each rasterRijen as r, ri (ri)}
					<div class="flex flex-col justify-center rounded-2xl bg-white/70 px-3 py-2">
						<span class="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{r.type}</span>
						<span class="text-[12.5px] font-medium leading-snug" title={r.tekst}>{kort(r.tekst, 80)}</span>
					</div>
					{#each rasterFases as f (f)}
						{@const c = celVan(ri, f)}
						{#if c}
							<div class={cn('rounded-2xl border bg-white p-3 transition-all', c.aan ? 'border-brand-action shadow-[0_4px_14px_rgba(0,87,60,0.08)]' : 'border-border opacity-60')}>
								<label class="flex cursor-pointer items-start gap-2">
									<input type="checkbox" bind:checked={c.aan} class="mt-1 size-4 shrink-0 accent-[#33B784]" aria-label="Opnemen: {c.naam}" />
									<textarea
										bind:value={c.naam}
										rows="2"
										aria-label="Naam invalshoek"
										class="field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-[13.5px] font-semibold leading-snug outline-none focus:ring-2 focus:ring-brand-action/30"
									></textarea>
								</label>
								<p class="mt-1.5 pl-6 text-[12px] leading-snug text-muted-foreground" title={c.onderbouwing}>{c.omschrijving}</p>
							</div>
						{:else}
							<div class="flex items-center justify-center rounded-2xl border border-dashed border-[#C6D5CC] px-3 py-4 text-center text-[11.5px] text-muted-foreground">
								Geen sterke hoek
							</div>
						{/if}
					{/each}
				{/each}
			</div>
		</div>

		{#if fout}
			<p class="mt-4 flex items-start gap-2 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
				<TriangleAlert class="mt-0.5 size-4 shrink-0" />{fout}
			</p>
		{/if}

		<div class="mt-5 flex flex-wrap items-center gap-3">
			<button
				type="button"
				disabled={bezigToevoegen || aantalAan === 0}
				class="inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#00432E] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:hover:translate-y-0"
				onclick={voegToe}
			>
				{#if bezigToevoegen}<LoaderCircle class="size-4 animate-spin" />{:else}<Check class="size-4" />{/if}
				{aantalAan ? `Voeg ${aantalAan} ${aantalAan === 1 ? 'invalshoek' : 'invalshoeken'} toe` : 'Vink minstens één invalshoek aan'}
			</button>
			<button
				type="button"
				class="rounded-full border bg-white px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
				onclick={() => (cellen = null)}
			>
				Opnieuw kiezen
			</button>
			<span class="text-[12.5px] text-muted-foreground">Je kunt namen hierboven nog aanpassen. Bestaande invalshoeken blijven ongewijzigd.</span>
		</div>
	{/if}
</div>
