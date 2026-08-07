<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import { TRIGGER_MAP_SECTIES, type Persona, type TekstSectieKey } from '$lib/trigger-map';
	import { saver, postJSON } from '$lib/saver.svelte';
	import { startTaak, stopTaak } from '$lib/taken.svelte';
	import { datumKort } from '$lib/format';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';

	let { data, form } = $props();
	let bezig = $state(false);

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
	function itemToevoegen(key: TekstSectieKey) {
		geselecteerd?.[key].push('');
	}
	function itemVerwijderen(key: TekstSectieKey, i: number) {
		geselecteerd?.[key].splice(i, 1);
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
</script>

<div class="space-y-6">
	<!-- Kop + genereerknop -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Trigger map</h2>
			<p class="text-sm text-muted-foreground">
				Het volledige klantbeeld uit de intake: pijnpunten, wensen, taal en persona's.
				{#if versies.length}
					· {versies.length}
					{versies.length === 1 ? 'versie' : 'versies'}.
				{/if}
			</p>
		</div>

		<div class="flex items-center gap-3">
			<div class="flex items-center gap-1.5 text-xs">
				{#if saver.fout}
					<TriangleAlert class="size-3.5 text-destructive" />
					<span class="text-destructive">Opslaan mislukt</span>
				{:else if saver.actief > 0}
					<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" />
					<span class="text-muted-foreground">Opslaan…</span>
				{:else if saver.laatstOpgeslagen}
					<Check class="size-3.5 text-brand-green" />
					<span class="text-muted-foreground">Opgeslagen</span>
				{/if}
			</div>

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
				<Button type="submit" disabled={bezig || !data.bron1Compleet}>
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
				</Button>
			</form>
		</div>
	</div>

	{#if !data.bron1Compleet}
		<div
			class="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800"
		>
			<TriangleAlert class="size-4 shrink-0" />
			Vul eerst de kern van Bron 1 (Klantgesprek) in — minimaal een handvol vragen — voordat je de
			trigger map genereert.
		</div>
	{/if}

	{#if form?.foutmelding}
		<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			<TriangleAlert class="size-4 shrink-0" />
			{form.foutmelding}
		</div>
	{/if}

	{#if bezig}
		<div
			class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-16 text-center"
		>
			<LoaderCircle class="size-6 animate-spin text-primary" />
			<p class="text-sm font-medium">Claude analyseert de intake…</p>
			<p class="text-xs text-muted-foreground">
				De trigger map wordt opgesteld en de invalshoeken meteen geprioriteerd. Dit kan een minuut
				duren.
			</p>
		</div>
	{:else if geselecteerd}
		<!-- Versie-selector + status -->
		<div class="flex flex-wrap items-center gap-3">
			<select
				bind:value={geselecteerdId}
				class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
			>
				{#each versies as v (v.id)}
					<option value={v.id}>
						Versie {v.versie_nummer} — {datumKort(v.created_at)}{v.is_actief ? ' (actief)' : ''}
					</option>
				{/each}
			</select>

			{#if bewerkbaar}
				<Badge variant="outline" class="border-brand-lime/50 bg-brand-lime/20 text-brand-green">
					Actieve versie — bewerkbaar
				</Badge>
			{:else}
				<span class="text-sm text-muted-foreground">Alleen-lezen (oude versie)</span>
				<Button size="sm" variant="outline" onclick={() => activeer(geselecteerd!.id)}>
					Maak deze versie actief
				</Button>
			{/if}
		</div>

		<!-- Tekstsecties -->
		<div
			class="grid grid-cols-1 gap-4 md:grid-cols-2"
			data-tour-order="2"
			data-tour-title="Trigger Map — het klantbeeld"
			data-tour-text="Claude distilleert de intake tot een helder klantbeeld: pijnpunten, wensen, bezwaren, taal van de doelgroep en kansen. Dit vormt de onderbouwing voor alles wat je gaat testen. Je kunt alles vrij bijstellen."
		>
			{#each TRIGGER_MAP_SECTIES as sectie (sectie.key)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-base">{sectie.label}</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-2">
						{#if bewerkbaar}
							{#each geselecteerd[sectie.key] as _, i (i)}
								<div class="flex items-start gap-2">
									<Input
										bind:value={geselecteerd[sectie.key][i]}
										onblur={() => saveSectie(sectie.key)}
										placeholder="Item…"
									/>
									<Button
										variant="ghost"
										size="sm"
										class="shrink-0 text-muted-foreground hover:text-destructive"
										onclick={() => itemVerwijderen(sectie.key, i)}
									>
										<Trash2 class="size-4" />
									</Button>
								</div>
							{/each}
							<Button variant="outline" size="sm" onclick={() => itemToevoegen(sectie.key)}>
								<Plus class="size-4" />
								Item toevoegen
							</Button>
						{:else if geselecteerd[sectie.key].length}
							<ul class="space-y-1.5">
								{#each geselecteerd[sectie.key] as item (item)}
									<li class="flex gap-2 text-sm">
										<span class="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-lime"></span>
										<span>{item}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-sm text-muted-foreground">Geen items.</p>
						{/if}
					</Card.Content>
				</Card.Root>
			{/each}
		</div>

		<!-- Persona's / doelgroep-segmenten -->
		<div
			class="space-y-3"
			data-tour-order="3"
			data-tour-title="Persona's"
			data-tour-text="De doelgroep-segmenten die uit de intake komen. Ze bepalen straks op wie je test — en meer persona's betekent meer campagnes/tests. De invalshoeken zelf (wat je gaat testen) verschijnen geprioriteerd in de Matrix."
		>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 class="text-base font-semibold">Persona's / doelgroep-segmenten</h3>
					<p class="text-sm text-muted-foreground">
						De segmenten waarop je content en het testplan zich richten.
					</p>
				</div>
				{#if bewerkbaar}
					<Button variant="outline" size="sm" onclick={personaToevoegen}>
						<Plus class="size-4" />
						Persona toevoegen
					</Button>
				{/if}
			</div>

			{#if geselecteerd.personas.length === 0}
				<p class="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
					Nog geen persona's. Genereer een nieuwe trigger map of voeg ze handmatig toe.
				</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each geselecteerd.personas as p (p)}
						<Card.Root>
							{#if bewerkbaar}
								<Card.Content class="space-y-2 pt-6">
									<div class="flex items-center gap-2">
										<Input bind:value={p.naam} onblur={savePersonas} placeholder="Naam segment" />
										<Button
											variant="ghost"
											size="sm"
											class="shrink-0 text-muted-foreground hover:text-destructive"
											title="Verwijderen"
											onclick={() => personaVerwijderen(p)}
										>
											<Trash2 class="size-4" />
										</Button>
									</div>
									<Textarea bind:value={p.omschrijving} onblur={savePersonas} rows={2} placeholder="Omschrijving" />
									<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
										<Input bind:value={p.kernbehoefte} onblur={savePersonas} placeholder="Kernbehoefte" />
										<Input bind:value={p.kernbezwaar} onblur={savePersonas} placeholder="Kernbezwaar" />
									</div>
								</Card.Content>
							{:else}
								<Card.Header>
									<Card.Title class="text-base">{p.naam}</Card.Title>
								</Card.Header>
								<Card.Content class="space-y-2 text-sm">
									<p>{p.omschrijving}</p>
									<p><span class="text-muted-foreground">Kernbehoefte:</span> {p.kernbehoefte}</p>
									<p><span class="text-muted-foreground">Kernbezwaar:</span> {p.kernbezwaar}</p>
								</Card.Content>
							{/if}
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Doorverwijzing naar de test-backlog -->
		<a
			href="/klanten/{data.client.id}/matrix"
			class="flex items-center justify-between gap-3 rounded-lg border border-brand-lime/40 bg-brand-mint/40 px-4 py-3 text-sm transition-colors hover:bg-brand-mint/60"
		>
			<span>
				<span class="font-medium text-brand-green">Invalshoeken staan in de matrix.</span>
				<span class="text-muted-foreground">
					Op basis van deze trigger map zijn de invalshoeken automatisch geprioriteerd (RICE) als
					test-backlog — daar bepaal je de tests.
				</span>
			</span>
			<ArrowRight class="size-4 shrink-0 text-brand-green" />
		</a>
	{:else}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<p class="text-sm font-medium text-foreground">Nog geen trigger map</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Genereer een trigger map op basis van de intake. Claude analyseert alle beschikbare bronnen en
				stelt pijnpunten, wensen, bezwaren, taal van de doelgroep, kansen en persona's voor. De
				invalshoeken verschijnen — automatisch geprioriteerd — als test-backlog in de matrix.
			</p>
		</div>
	{/if}
</div>
