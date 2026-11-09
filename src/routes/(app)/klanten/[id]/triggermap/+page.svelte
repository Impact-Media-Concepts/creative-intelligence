<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Component } from 'svelte';
	import { cn } from '$lib/utils';
	import { type Persona, type TekstSectieKey } from '$lib/trigger-map';
	import { saver, postJSON } from '$lib/saver.svelte';
	import { startTaak, stopTaak } from '$lib/taken.svelte';
	import { datumKort } from '$lib/format';
	import SamenvattingHero from '$lib/components/app/triggermap/SamenvattingHero.svelte';
	import SectieRail, { type RailSectie } from '$lib/components/app/triggermap/SectieRail.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Star from '@lucide/svelte/icons/star';
	import Shield from '@lucide/svelte/icons/shield';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Clock from '@lucide/svelte/icons/clock';
	import Trophy from '@lucide/svelte/icons/trophy';
	import Users from '@lucide/svelte/icons/users';

	let { data, form } = $props();
	let bezig = $state(false);
	const base = $derived(`/klanten/${data.client.id}`);

	interface VersieUI {
		id: string;
		versie_nummer: number;
		is_actief: boolean;
		created_at: string;
		pijnpunten: string[];
		wensen: string[];
		bezwaren: string[];
		taal_doelgroep: string[];
		routines: string[];
		kansen_vs_concurrenten: string[];
		personas: Persona[];
	}

	function mapVersies(rows: typeof data.versies): VersieUI[] {
		return rows.map((v) => ({
			id: v.id,
			versie_nummer: v.versie_nummer,
			is_actief: v.is_actief,
			created_at: v.created_at,
			pijnpunten: (v.pijnpunten as string[] | null) ?? [],
			wensen: (v.wensen as string[] | null) ?? [],
			bezwaren: (v.bezwaren as string[] | null) ?? [],
			taal_doelgroep: (v.taal_doelgroep as string[] | null) ?? [],
			routines: (v.routines as string[] | null) ?? [],
			kansen_vs_concurrenten: (v.kansen_vs_concurrenten as string[] | null) ?? [],
			personas: ((v as { personas?: Persona[] | null }).personas as Persona[] | null) ?? []
		}));
	}

	// svelte-ignore state_referenced_locally
	let versies = $state<VersieUI[]>(mapVersies(data.versies));
	// svelte-ignore state_referenced_locally
	let geselecteerdId = $state<string | null>(
		data.versies.find((v) => v.is_actief)?.id ?? data.versies[0]?.id ?? null
	);

	// Herlaad lokale state wanneer de serverdata verandert (na nieuwe generatie).
	$effect(() => {
		versies = mapVersies(data.versies);
		geselecteerdId = data.versies.find((v) => v.is_actief)?.id ?? data.versies[0]?.id ?? null;
	});

	let geselecteerd = $derived(versies.find((v) => v.id === geselecteerdId) ?? null);
	let bewerkbaar = $derived(!!geselecteerd?.is_actief);

	// ---- Secties (één tegelijk bewerken) ----
	type SectieKey = TekstSectieKey | 'personas';
	const SECTIES: Array<{
		key: SectieKey;
		label: string;
		sub: string;
		hint: string;
		kleur: string;
		iconKleur: string;
		tint: string;
		icoon: Component<{ class?: string }>;
	}> = [
		{ key: 'pijnpunten', label: 'Pijnpunten', sub: 'Waar loopt deze doelgroep tegenaan?', hint: 'Typ een pijnpunt en druk op enter…', kleur: '#FA5E19', iconKleur: '#FFFFFF', tint: '#FEF0E8', icoon: TriangleAlert },
		{ key: 'wensen', label: 'Wensen', sub: 'Wat willen ze bereiken?', hint: 'Typ een wens en druk op enter…', kleur: '#96D247', iconKleur: '#00573C', tint: '#F4FAE8', icoon: Star },
		{ key: 'bezwaren', label: 'Bezwaren', sub: 'Wat houdt ze tegen bij het afrekenen?', hint: 'Typ een bezwaar en druk op enter…', kleur: '#52AE32', iconKleur: '#FFFFFF', tint: '#EFF8EA', icoon: Shield },
		{ key: 'taal_doelgroep', label: 'Taal van de doelgroep', sub: 'Hun eigen woorden — gebruik die letterlijk', hint: 'Typ een uitdrukking en druk op enter…', kleur: '#33B784', iconKleur: '#FFFFFF', tint: '#DCF3EA', icoon: MessageCircle },
		{ key: 'routines', label: 'Routines', sub: 'Wanneer en hoe kopen ze?', hint: 'Typ een routine en druk op enter…', kleur: '#0B6E4E', iconKleur: '#FFFFFF', tint: '#EAF5EF', icoon: Clock },
		{ key: 'kansen_vs_concurrenten', label: 'Kansen', sub: 'Waar je het van de concurrent wint', hint: 'Typ een kans en druk op enter…', kleur: '#00573C', iconKleur: '#96D247', tint: '#EAF5EF', icoon: Trophy },
		{ key: 'personas', label: "Persona's", sub: 'Op wie je test — meer persona’s is meer campagnes', hint: '', kleur: '#00573C', iconKleur: '#FFFFFF', tint: '#EAF5EF', icoon: Users }
	];

	function aantalIn(key: SectieKey): number {
		if (!geselecteerd) return 0;
		return key === 'personas' ? geselecteerd.personas.length : geselecteerd[key].length;
	}
	const DOEL = 3; // vanaf 3 signalen telt een sectie als compleet (persona's: 1)
	function isCompleet(key: SectieKey): boolean {
		return aantalIn(key) >= (key === 'personas' ? 1 : DOEL);
	}

	let railSecties = $derived<RailSectie[]>(
		SECTIES.map((s) => ({ ...s, aantal: aantalIn(s.key) }))
	);
	let eersteOnvolledig = $derived(SECTIES.find((s) => !isCompleet(s.key))?.key ?? SECTIES[0].key);
	let actieveKey = $derived.by<SectieKey>(() => {
		const uitUrl = page.url.searchParams.get('sectie');
		return SECTIES.find((s) => s.key === uitUrl)?.key ?? eersteOnvolledig;
	});
	let actieveIdx = $derived(SECTIES.findIndex((s) => s.key === actieveKey));
	let sectie = $derived(SECTIES[actieveIdx]);
	let vorige = $derived(actieveIdx > 0 ? SECTIES[actieveIdx - 1] : null);
	let volgende = $derived(actieveIdx < SECTIES.length - 1 ? SECTIES[actieveIdx + 1] : null);

	function kies(key: string) {
		goto(`${page.url.pathname}?sectie=${key}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	// ---- Samenvatting-hero ----
	// Signalen hebben vaak een toelichting tussen haakjes; die laten we weg in de zin, en
	// we knippen nooit midden in een woord.
	const kort = (s: string, n = 80) => {
		const kaal = s.replace(/\s*\([^)]*\)?/g, '').trim() || s;
		if (kaal.length <= n) return kaal;
		const snede = kaal.slice(0, n).replace(/\s+\S*$/, '');
		return snede.trimEnd() + '…';
	};
	let pct = $derived(Math.round((SECTIES.filter((s) => isCompleet(s.key)).length / SECTIES.length) * 100));
	let onvolledig = $derived(SECTIES.filter((s) => !isCompleet(s.key)).length);
	let hint = $derived(
		onvolledig === 0
			? 'Elk onderdeel heeft genoeg signalen. Door naar de testruimte.'
			: `Nog ${onvolledig} ${onvolledig === 1 ? 'onderdeel' : 'onderdelen'} met te weinig signalen. Vul die aan voor een scherpere strategie.`
	);
	let samenvatting = $derived.by(() => {
		const g = geselecteerd;
		const wens = g?.wensen[0]?.trim();
		const pijn = g?.pijnpunten[0]?.trim();
		const bezwaar = g?.bezwaren[0]?.trim();
		if (!wens && !pijn && !bezwaar) return 'Vul de signalen aan om je klantbeeld scherp te krijgen.';
		const wil = wens ? `Je doelgroep wil: “${kort(wens)}”.` : '';
		const houdtTegen = [pijn && `“${kort(pijn, 60)}”`, bezwaar && `“${kort(bezwaar, 60)}”`]
			.filter(Boolean)
			.join(' en ');
		return [wil, houdtTegen ? `Dat loopt stuk op ${houdtTegen}.` : ''].filter(Boolean).join(' ');
	});

	// ---- Opslaan (ongewijzigd) ----
	function saveSectie(key: TekstSectieKey) {
		if (!geselecteerd) return;
		return postJSON('/api/trigger-map', {
			type: 'sectie',
			versieId: geselecteerd.id,
			key,
			items: geselecteerd[key]
		});
	}
	function savePersonas() {
		if (!geselecteerd) return;
		return postJSON('/api/trigger-map', {
			type: 'personas',
			versieId: geselecteerd.id,
			personas: geselecteerd.personas
		});
	}
	function personaToevoegen() {
		geselecteerd?.personas.push({ naam: '', omschrijving: '', kernbehoefte: '', kernbezwaar: '' });
	}
	function personaVerwijderen(p: Persona) {
		if (!geselecteerd) return;
		const i = geselecteerd.personas.indexOf(p);
		if (i >= 0) geselecteerd.personas.splice(i, 1);
		savePersonas();
	}
	function itemVerwijderen(key: TekstSectieKey, i: number) {
		geselecteerd?.[key].splice(i, 1);
		saveSectie(key);
	}
	// Nieuw signaal: typ + enter. Focus blijft in het veld zodat je meteen door kunt typen.
	let nieuw = $state<Record<string, string>>({});
	function itemToevoegen(key: TekstSectieKey) {
		const v = (nieuw[key] ?? '').trim();
		if (!v || !geselecteerd) return;
		geselecteerd[key].push(v);
		nieuw[key] = '';
		saveSectie(key);
	}
	async function activeer(id: string) {
		await postJSON('/api/trigger-map', {
			type: 'activeer',
			clientId: data.client.id,
			versieId: id
		});
		versies.forEach((v) => (v.is_actief = v.id === id));
		geselecteerdId = id;
	}

	const initialen = (naam: string) =>
		naam.replace(/[^a-zA-Z ]/g, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
	const veldRij =
		'min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[15px] outline-none transition-all focus:border-brand-action focus:ring-[3px] focus:ring-brand-action/25';
</script>

<div class="space-y-5">
	<!-- Statusregel + versie + genereren -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-1.5 text-[13px] text-muted-foreground">
			{#if saver.fout}
				<TriangleAlert class="size-3.5 text-destructive" />
				<span class="text-destructive">Opslaan mislukt</span>
			{:else if saver.actief > 0}
				<LoaderCircle class="size-3.5 animate-spin" />
				Opslaan…
			{:else if geselecteerd}
				<Check class="size-3.5 text-brand-action" strokeWidth={2.4} />
				Alles opgeslagen
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			{#if geselecteerd}
				<select
					bind:value={geselecteerdId}
					aria-label="Versie"
					class="rounded-full border bg-card px-4 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-brand-action/30"
				>
					{#each versies as v (v.id)}
						<option value={v.id}>
							Versie {v.versie_nummer} — {datumKort(v.created_at)}{v.is_actief ? ' (actief)' : ''}
						</option>
					{/each}
				</select>
			{/if}

			<form
				method="POST"
				action="?/genereren"
				use:enhance={({ cancel }) => {
					if (versies.length && !confirm('Een nieuwe versie genereren? De huidige blijft bewaard.')) {
						cancel();
						return;
					}
					bezig = true;
					const taakId = startTaak('Trigger map genereren');
					return async ({ update }) => {
						await update();
						bezig = false;
						stopTaak(taakId);
					};
				}}
			>
				<button
					type="submit"
					disabled={bezig || !data.bron1Compleet}
					class="inline-flex items-center gap-2 rounded-full bg-brand-action px-[18px] py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#2AA376] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 motion-reduce:hover:translate-y-0"
				>
					{#if bezig}
						<LoaderCircle class="size-4 animate-spin" />
						Genereren…
					{:else if versies.length}
						<RefreshCw class="size-4" />
						Opnieuw genereren
					{:else}
						<Sparkles class="size-4" />
						Trigger map genereren
					{/if}
				</button>
			</form>
		</div>
	</div>

	{#if !data.bron1Compleet}
		<div class="flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			<span>
				Vul eerst de kern van Bron 1 (Klantgesprek) in — minimaal een handvol vragen — voordat je de
				trigger map genereert.
				<a href="{base}/intake" class="whitespace-nowrap font-medium underline">Naar de intake</a>
			</span>
		</div>
	{/if}

	{#if form?.foutmelding}
		<div class="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
			<TriangleAlert class="mt-0.5 size-4 shrink-0" />
			{form.foutmelding}
		</div>
	{/if}

	{#if bezig}
		<div class="flex flex-col items-center justify-center gap-2 rounded-[28px] border border-dashed bg-card py-16 text-center">
			<LoaderCircle class="size-6 animate-spin text-brand-action" />
			<p class="text-sm font-medium">Claude analyseert de intake…</p>
			<p class="text-xs text-muted-foreground">
				De trigger map wordt opgesteld en de invalshoeken meteen geprioriteerd. Dit kan een minuut
				duren.
			</p>
		</div>
	{:else if geselecteerd}
		<SamenvattingHero {samenvatting} {pct} {hint} />

		{#if !bewerkbaar}
			<div class="flex flex-wrap items-center gap-3 rounded-2xl bg-[#FEF0E8] px-4 py-3 text-sm">
				<span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#B8410C]">Oude versie — alleen lezen</span>
				<button
					type="button"
					class="rounded-full border bg-card px-4 py-1.5 text-sm font-medium hover:bg-muted"
					onclick={() => activeer(geselecteerd!.id)}>Maak deze versie actief</button
				>
			</div>
		{/if}

		<div
			class="grid items-start gap-5 lg:grid-cols-[268px_minmax(0,1fr)]"
			data-tour-order="2"
			data-tour-title="Trigger Map — het klantbeeld"
			data-tour-text="Claude distilleert de intake tot een helder klantbeeld. Links kies je een onderdeel (pijnpunten, wensen, bezwaren, taal, routines, kansen, persona's); rechts bewerk je er één tegelijk. Alles wat je typt wordt automatisch opgeslagen."
		>
			<SectieRail secties={railSecties} actief={actieveKey} onKies={kies} />

			<div class="space-y-4">
				<div class="rounded-[28px] border bg-card px-7 py-[26px]">
					<!-- Kop van de sectie -->
					<div class="flex flex-wrap items-center gap-3.5">
						<span
							class="flex size-11 shrink-0 items-center justify-center rounded-full"
							style="background:{sectie.kleur};color:{sectie.iconKleur}"
						>
							<sectie.icoon class="size-[21px]" />
						</span>
						<div class="min-w-0 flex-1">
							<h3 class="font-display text-2xl font-bold leading-tight text-brand-green">{sectie.label}</h3>
							<p class="mt-0.5 text-sm text-muted-foreground">
								{sectie.sub} · {aantalIn(sectie.key)}
								{sectie.key === 'personas' ? "persona's" : 'signalen'} · onderdeel {actieveIdx + 1} van {SECTIES.length}
							</p>
						</div>
						<a
							href="{base}/intake"
							class="rounded-full border bg-card px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							Bron in intake
						</a>
					</div>

					<div class="mt-5" aria-live="polite">
						{#if sectie.key !== 'personas'}
							{@const key = sectie.key}
							<div class="flex flex-col gap-2.5">
								{#each geselecteerd[key] as _, i (i)}
									<div class="group flex items-center gap-3 rounded-[20px] border bg-card px-[18px] py-3 transition-all hover:-translate-y-px hover:border-brand-action hover:shadow-[0_8px_20px_rgba(0,87,60,0.08)] motion-reduce:hover:translate-y-0">
										{#if bewerkbaar}
											<input
												bind:value={geselecteerd[key][i]}
												onblur={() => saveSectie(key)}
												onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
												aria-label="{sectie.label} {i + 1}"
												class={veldRij}
											/>
											<button
												type="button"
												title="Verwijderen"
												aria-label="Verwijderen"
												class="flex size-8 shrink-0 items-center justify-center rounded-full text-[#9AA8A0] transition-colors hover:bg-[#FEF0E8] hover:text-brand-orange"
												onclick={() => itemVerwijderen(key, i)}
											>
												<Trash2 class="size-4" />
											</button>
										{:else}
											<span class="flex-1 px-1.5 py-0.5 text-[15px]">{geselecteerd[key][i]}</span>
										{/if}
									</div>
								{/each}

								{#if bewerkbaar}
									<div class="flex items-center gap-3 rounded-[20px] border border-dashed border-[#C6D5CC] bg-[#FAFCFB] px-[18px] py-3">
										<Plus class="size-4 shrink-0 text-brand-action" strokeWidth={2.4} />
										<input
											bind:value={nieuw[key]}
											onkeydown={(e) => e.key === 'Enter' && itemToevoegen(key)}
											placeholder={sectie.hint}
											aria-label="Nieuw signaal toevoegen"
											class="min-w-0 flex-1 bg-transparent px-1.5 py-0.5 text-[15px] outline-none placeholder:text-muted-foreground/70"
										/>
									</div>
								{:else if geselecteerd[key].length === 0}
									<p class="text-sm text-muted-foreground">Geen items.</p>
								{/if}
							</div>
						{:else}
							<div class="flex flex-col gap-3">
								{#each geselecteerd.personas as p (p)}
									<div class="rounded-[22px] border bg-card p-5 transition-shadow hover:shadow-[0_8px_20px_rgba(0,87,60,0.08)]">
										<div class="flex items-center gap-3">
											<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-green text-[13px] font-bold text-white">{initialen(p.naam)}</span>
											{#if bewerkbaar}
												<input bind:value={p.naam} onblur={savePersonas} placeholder="Naam segment" aria-label="Naam segment" class={cn(veldRij, 'font-display text-lg font-bold text-brand-green')} />
												<button
													type="button"
													title="Verwijderen"
													aria-label="Persona verwijderen"
													class="flex size-8 shrink-0 items-center justify-center rounded-full text-[#9AA8A0] transition-colors hover:bg-[#FEF0E8] hover:text-brand-orange"
													onclick={() => personaVerwijderen(p)}
												>
													<Trash2 class="size-4" />
												</button>
											{:else}
												<span class="font-display text-lg font-bold text-brand-green">{p.naam}</span>
											{/if}
										</div>
										{#if bewerkbaar}
											<textarea
												bind:value={p.omschrijving}
												onblur={savePersonas}
												rows="2"
												placeholder="Wie is dit, in 1-2 zinnen"
												aria-label="Omschrijving"
												class="mt-3 w-full resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-[14.5px] leading-relaxed outline-none transition-all focus:border-brand-action focus:ring-[3px] focus:ring-brand-action/25"
											></textarea>
										{:else}
											<p class="mt-3 px-1.5 text-[14.5px] leading-relaxed">{p.omschrijving}</p>
										{/if}
										<div class="mt-3 grid gap-2 sm:grid-cols-2">
											<label class="flex items-start gap-2 rounded-[18px] bg-brand-mint px-3.5 py-2 text-[13px]">
												<span class="shrink-0 font-semibold text-brand-green">Wil</span>
												{#if bewerkbaar}
													<textarea bind:value={p.kernbehoefte} onblur={savePersonas} rows="1" placeholder="kernbehoefte" aria-label="Kernbehoefte" class="field-sizing-content min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground/60"></textarea>
												{:else}
													<span>{p.kernbehoefte}</span>
												{/if}
											</label>
											<label class="flex items-start gap-2 rounded-[18px] bg-[#FEF0E8] px-3.5 py-2 text-[13px]">
												<span class="shrink-0 font-semibold text-brand-orange">Twijfelt</span>
												{#if bewerkbaar}
													<textarea bind:value={p.kernbezwaar} onblur={savePersonas} rows="1" placeholder="kernbezwaar" aria-label="Kernbezwaar" class="field-sizing-content min-w-0 flex-1 resize-none bg-transparent outline-none placeholder:text-muted-foreground/60"></textarea>
												{:else}
													<span>{p.kernbezwaar}</span>
												{/if}
											</label>
										</div>
									</div>
								{/each}

								{#if geselecteerd.personas.length === 0}
									<p class="rounded-[20px] border border-dashed bg-[#FAFCFB] px-[18px] py-3 text-sm text-muted-foreground">
										Nog geen persona's. Genereer een nieuwe trigger map of voeg ze handmatig toe.
									</p>
								{/if}
								{#if bewerkbaar}
									<button
										type="button"
										class="flex items-center gap-3 rounded-[20px] border border-dashed border-[#C6D5CC] bg-[#FAFCFB] px-[18px] py-3 text-left text-[15px] text-muted-foreground transition-colors hover:border-brand-action hover:text-foreground"
										onclick={personaToevoegen}
									>
										<Plus class="size-4 shrink-0 text-brand-action" strokeWidth={2.4} />
										Persona toevoegen
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Navigatie onderaan -->
				<div class="flex flex-wrap items-center justify-between gap-3">
					{#if vorige}
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-full border bg-card px-[18px] py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-muted motion-reduce:hover:translate-y-0"
							onclick={() => kies(vorige.key)}
						>
							<ArrowLeft class="size-4" /> Terug: {vorige.label}
						</button>
					{:else}
						<a
							href="{base}/intake"
							class="inline-flex items-center gap-2 rounded-full border bg-card px-[18px] py-2.5 text-sm font-medium transition-all hover:-translate-y-0.5 hover:bg-muted motion-reduce:hover:translate-y-0"
						>
							<ArrowLeft class="size-4" /> Terug naar de intake
						</a>
					{/if}

					{#if volgende}
						<button
							type="button"
							class="inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#00432E] hover:shadow-[0_12px_26px_rgba(0,87,60,0.22)] motion-reduce:hover:translate-y-0"
							onclick={() => kies(volgende.key)}
						>
							Volgende: {volgende.label} <ArrowRight class="size-4" />
						</button>
					{:else}
						<a
							href="{base}/testruimte"
							class="inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#00432E] hover:shadow-[0_12px_26px_rgba(0,87,60,0.22)] motion-reduce:hover:translate-y-0"
						>
							Naar de testruimte <ArrowRight class="size-4" />
						</a>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div class="rounded-[28px] border border-dashed bg-card p-10 text-center">
			<p class="font-display text-lg font-bold text-brand-green">Nog geen trigger map</p>
			<p class="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
				Genereer een trigger map op basis van de intake. Claude analyseert alle beschikbare bronnen en
				stelt pijnpunten, wensen, bezwaren, taal van de doelgroep, kansen en persona's voor. De
				invalshoeken verschijnen — automatisch geprioriteerd — als test-backlog in de matrix.
			</p>
		</div>
	{/if}
</div>
