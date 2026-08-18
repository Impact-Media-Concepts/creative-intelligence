<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Textarea } from '$lib/components/ui/textarea';
	import { saver, postJSON } from '$lib/saver.svelte';
	import { cn } from '$lib/utils';
	import type { Concept } from '$lib/supabase/database.types';
	import {
		afgeleidePrioriteit,
		riceScore,
		invalshoekStatus,
		INVALSHOEK_STATUSSEN,
		SCORE_NIVEAUS,
		SCORE_FACTOREN,
		type Invalshoek,
		type InvalshoekScore,
		type ScoreNiveau
	} from '$lib/trigger-map';
	import {
		FUNNELFASES,
		FORMATS,
		STRUCTUREN,
		TEST_VARIABELEN,
		PRIORITEITEN,
		CONCEPT_STATUSSEN,
		TESTVOLGORDE,
		sorteerConcepten
	} from '$lib/matrix';
	import type { Testplan, StrategiePlan } from '$lib/testplan';
	import { SPRINT_VELDEN } from '$lib/testplan';
	import { Input } from '$lib/components/ui/input';
	import SparPaneel from '$lib/components/app/SparPaneel.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Copy from '@lucide/svelte/icons/copy';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Check from '@lucide/svelte/icons/check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Info from '@lucide/svelte/icons/info';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let concepten = $state<Concept[]>(data.concepten.map((c) => ({ ...c })));
	$effect(() => {
		concepten = data.concepten.map((c) => ({ ...c }));
	});
	let toonArchief = $state(false);
	let bezigGenereren = $state(false);
	let genereerFout = $state<string | null>(null);

	// Uitgeklapte onderbouwing-rijen (per concept-id).
	let uitgeklapt = $state<Set<string>>(new Set());
	function toggleOnderbouwing(id: string) {
		const next = new Set(uitgeklapt);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		uitgeklapt = next;
	}

	// svelte-ignore state_referenced_locally
	let testplan = $state<Testplan | null>((data.client.testplan as Testplan | null) ?? null);
	let bezigTestplan = $state(false);
	let testplanFout = $state<string | null>(null);
	let feedback = $state('');

	async function genereerTestplan() {
		bezigTestplan = true;
		testplanFout = null;
		try {
			const { testplan: tp } = await postJSON<{ testplan: Testplan }>(
				'/api/testplan',
				{ type: 'genereer', clientId: data.client.id, feedback },
				{ taak: 'Testplan genereren' }
			);
			testplan = tp;
			feedback = '';
		} catch (e) {
			testplanFout = e instanceof Error ? e.message : 'Testplan genereren mislukt';
		} finally {
			bezigTestplan = false;
		}
	}

	let actief = $derived(sorteerConcepten(concepten.filter((c) => !c.gearchiveerd)));
	let archief = $derived(concepten.filter((c) => c.gearchiveerd));

	const veldClass =
		'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
	// Zelfde stijl, maar meegroeiend en met tekst-ombreking (geen h-8, geen resize-handle).
	const veldClassTa =
		'w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-snug focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';

	/**
	 * Meegroeiend tekstveld dat compact blijft (max. hoogte, dan intern scrollen) zolang het geen
	 * focus heeft, en volledig uitklapt zodra je erin klikt — zo blijft de matrix scanbaar én zie je
	 * alle tekst bij bewerken.
	 */
	function autogrow(node: HTMLTextAreaElement, max = 96) {
		const resize = () => {
			const focused = document.activeElement === node;
			node.style.height = 'auto';
			const vol = node.scrollHeight;
			node.style.height = `${focused ? vol : Math.min(vol, max)}px`;
			node.style.overflowY = !focused && vol > max ? 'auto' : 'hidden';
		};
		resize();
		node.addEventListener('input', resize);
		node.addEventListener('focus', resize);
		node.addEventListener('blur', resize);
		return {
			update(nieuwMax: number) {
				max = nieuwMax;
				resize();
			},
			destroy() {
				node.removeEventListener('input', resize);
				node.removeEventListener('focus', resize);
				node.removeEventListener('blur', resize);
			}
		};
	}

	function saveVeld(c: Concept, veld: keyof Concept) {
		return postJSON('/api/concepts', { type: 'update', id: c.id, patch: { [veld]: c[veld] } });
	}
	async function rijToevoegen() {
		const { concept } = await postJSON<{ concept: Concept }>('/api/concepts', {
			type: 'insert',
			clientId: data.client.id
		});
		concepten.push(concept);
	}
	async function dupliceer(c: Concept) {
		const { concept } = await postJSON<{ concept: Concept }>('/api/concepts', {
			type: 'dupliceer',
			id: c.id
		});
		concepten.push(concept);
	}
	async function archiveer(c: Concept) {
		await postJSON('/api/concepts', { type: 'archiveer', id: c.id });
		c.gearchiveerd = true;
	}
	async function herstel(c: Concept) {
		await postJSON('/api/concepts', { type: 'herstel', id: c.id });
		c.gearchiveerd = false;
	}
	// ---- Test-backlog (invalshoeken uit de actieve trigger map) ----
	// svelte-ignore state_referenced_locally
	let invalshoeken = $state<Invalshoek[]>(data.invalshoeken.map((i) => ({ ...i })));
	$effect(() => {
		invalshoeken = data.invalshoeken.map((i) => ({ ...i }));
	});
	let versieId = $derived(data.versieId);

	// Geprioriteerde backlog op RICE-score (hoog→laag); ongescoorde onderaan.
	let backlog = $derived(
		invalshoeken
			.filter((i) => !i.gearchiveerd)
			.map((inv, idx) => ({ inv, idx }))
			.sort((a, b) => {
				const ra = a.inv.score ? riceScore(a.inv.score) : -1;
				const rb = b.inv.score ? riceScore(b.inv.score) : -1;
				if (rb !== ra) return rb - ra;
				return a.idx - b.idx;
			})
			.map((x) => x.inv)
	);
	let backlogArchief = $derived(invalshoeken.filter((i) => i.gearchiveerd));
	let overneembareInvalshoeken = $derived(invalshoeken.filter((inv) => !inv.gearchiveerd));

	let uitgeklapteInv = $state<Set<Invalshoek>>(new Set());
	function toggleInv(inv: Invalshoek) {
		const next = new Set(uitgeklapteInv);
		if (next.has(inv)) next.delete(inv);
		else next.add(inv);
		uitgeklapteInv = next;
	}
	let toonBacklogArchief = $state(false);
	// Backlog standaard ingeklapt zodra er al concepten zijn (dan zie je meteen de matrix),
	// open wanneer je nog moet beginnen.
	// svelte-ignore state_referenced_locally
	let backlogOpen = $state(data.concepten.filter((c) => !c.gearchiveerd).length === 0);

	const DEFAULT_SCORE: InvalshoekScore = {
		bereik: 'Middel',
		impact: 'Middel',
		bewijskracht: 'Middel',
		effort: 'Middel'
	};
	let bezigScores = $state(false);
	let scoresFout = $state<string | null>(null);

	function saveInvalshoeken() {
		if (!versieId) return;
		return postJSON('/api/trigger-map', { type: 'invalshoeken', versieId, invalshoeken });
	}
	function setInvScore(inv: Invalshoek, factor: keyof InvalshoekScore, waarde: ScoreNiveau) {
		inv.score = { ...(inv.score ?? DEFAULT_SCORE), [factor]: waarde };
		saveInvalshoeken();
	}
	function invToevoegen() {
		const inv: Invalshoek = {
			naam: '',
			omschrijving: '',
			funnelfase: 'TOFU',
			onderbouwing: '',
			status: 'Nieuw',
			gearchiveerd: false
		};
		invalshoeken.push(inv);
		toggleInv(inv);
	}
	function invVerwijderen(inv: Invalshoek) {
		const i = invalshoeken.indexOf(inv);
		if (i >= 0) invalshoeken.splice(i, 1);
		saveInvalshoeken();
	}
	function invArchiveer(inv: Invalshoek, waarde: boolean) {
		inv.gearchiveerd = waarde;
		saveInvalshoeken();
	}
	async function scoresVoorstellen() {
		if (!versieId) return;
		bezigScores = true;
		scoresFout = null;
		try {
			const { invalshoeken: nw } = await postJSON<{ invalshoeken: Invalshoek[] }>(
				'/api/trigger-map',
				{ type: 'scores', clientId: data.client.id, versieId }
			);
			invalshoeken = nw.map((i) => ({ ...i }));
		} catch (e) {
			scoresFout = e instanceof Error ? e.message : 'Scores voorstellen mislukt';
		} finally {
			bezigScores = false;
		}
	}

	const funnelKleur: Record<string, string> = {
		TOFU: 'border-blue-300 bg-blue-100 text-blue-800',
		MOFU: 'border-amber-300 bg-amber-100 text-amber-800',
		BOFU: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green'
	};
	const invStatusKleur: Record<string, string> = {
		Nieuw: 'border-border bg-muted text-muted-foreground',
		'In test': 'border-amber-300 bg-amber-100 text-amber-800',
		'Getest — werkt': 'border-brand-lime/50 bg-brand-lime/20 text-brand-green',
		'Getest — werkt niet': 'border-red-300 bg-red-100 text-red-700'
	};
	const prioriteitKleur: Record<string, string> = {
		Hoog: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green',
		Middel: 'border-amber-300 bg-amber-100 text-amber-800',
		Laag: 'border-border bg-muted text-muted-foreground'
	};

	async function neemInvalshoekenOver() {
		for (const inv of overneembareInvalshoeken) {
			const { concept } = await postJSON<{ concept: Concept }>('/api/concepts', {
				type: 'insert',
				clientId: data.client.id,
				concept: {
					funnelfase: inv.funnelfase,
					invalshoek: inv.naam,
					hypothese: inv.omschrijving,
					variabele: 'Invalshoek',
					prioriteit: inv.score ? afgeleidePrioriteit(inv.score) : 'Hoog',
					onderbouwing: inv.score?.toelichting ?? inv.onderbouwing ?? null,
					status: 'Idee'
				}
			});
			concepten.push(concept);
		}
	}
	let richtlijnen = $state('');
	let toonRichtlijnen = $state(false);

	// ---- Teststrategie-configuratie (optioneel; leeg = geen beperking) ----
	const DOELSTELLINGEN = ['Awareness / engagement', 'Balans', 'Direct rendement (CPA/ROAS)'];
	const MAX_VARIANTEN_OPTIES = [2, 3, 4, 5];
	let toonStrategie = $state(false);
	let cfgPersonas = $state<string[]>([]);
	let cfgFunnels = $state<string[]>([]);
	let cfgMiddelen = $state<string[]>([]);
	let cfgDoel = $state('');
	let cfgTarget = $state('');
	let cfgMaxVarianten = $state(3);
	let cfgParallel = $state(false);
	let personaNamen = $derived(data.personas.map((p) => p.naam).filter(Boolean));
	function toggleIn(arr: string[], v: string): string[] {
		return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
	}
	function chipClass(actief: boolean) {
		return cn(
			'rounded-full border px-2.5 py-1 text-xs transition-colors',
			actief
				? 'border-brand-green bg-brand-mint/50 font-medium text-brand-green'
				: 'border-border text-muted-foreground hover:bg-muted'
		);
	}
	/** Bundelt de teststrategie-configuratie voor de API-calls. */
	function huidigeConfig() {
		return {
			personas: cfgPersonas,
			funnelfases: cfgFunnels,
			middelen: cfgMiddelen,
			doelstelling: cfgDoel,
			target: cfgTarget,
			maxVarianten: cfgMaxVarianten,
			parallel: cfgParallel
		};
	}
	let configActief = $derived(
		cfgPersonas.length > 0 ||
			cfgFunnels.length > 0 ||
			cfgMiddelen.length > 0 ||
			!!cfgDoel ||
			!!cfgTarget.trim() ||
			cfgParallel
	);

	/** Korte, leesbare context voor de spar-strateeg (zodat 'ie o.a. je middelen kent). */
	function sparContext(): string {
		const r: string[] = [];
		r.push(
			cfgMiddelen.length
				? `Beschikbare middelen (formats): ${cfgMiddelen.join(', ')}.`
				: 'Beschikbare middelen: geen beperking opgegeven.'
		);
		if (cfgPersonas.length) r.push(`Persona-scope: ${cfgPersonas.join(', ')}.`);
		if (cfgFunnels.length) r.push(`Funnel-scope: ${cfgFunnels.join(', ')}.`);
		if (cfgDoel) r.push(`Doelstelling/KPI: ${cfgDoel}.`);
		if (cfgTarget.trim()) r.push(`Target: ${cfgTarget.trim()}.`);
		if (cfgParallel) r.push('Parallel testen toegestaan.');
		if (richtlijnen.trim()) r.push(`Extra sturing die al is ingevuld: ${richtlijnen.trim()}`);
		return r.join('\n');
	}

	// 3-weg keuze bij genereren met bestaande concepten.
	let regenOpen = $state(false);
	let regenExtra = $state('');
	let regenNaPlan = $state(false);

	/** Beslist of de 3-weg-dialog nodig is (bestaande concepten) of direct genereren kan. */
	function startGenereren(extra = '', naPlan = false) {
		if (actief.length === 0) {
			genereerMatrix(extra, 'toevoegen').then(() => {
				if (naPlan && !genereerFout) plan = null;
			});
		} else {
			regenExtra = extra;
			regenNaPlan = naPlan;
			regenOpen = true;
		}
	}
	async function bevestigRegen(modus: 'toevoegen' | 'opnieuw') {
		regenOpen = false;
		await genereerMatrix(regenExtra, modus);
		if (regenNaPlan && !genereerFout) plan = null;
		regenExtra = '';
		regenNaPlan = false;
	}

	async function genereerMatrix(extraRichtlijnen = '', modus: 'toevoegen' | 'opnieuw' = 'toevoegen') {
		bezigGenereren = true;
		genereerFout = null;
		try {
			// "Volledig opnieuw": bestaande concepten eerst archiveren.
			if (modus === 'opnieuw' && actief.length > 0) {
				await postJSON('/api/concepts', { type: 'archiveer_alle', clientId: data.client.id });
				concepten = concepten.map((c) => (c.gearchiveerd ? c : { ...c, gearchiveerd: true }));
			}
			// Scorekaart-borging: eerst scoren als de backlog nog ongescoord is, zodat de
			// prioriteit RICE-gedreven is (niet een losse LLM-gok).
			if (versieId && invalshoeken.some((i) => !i.gearchiveerd && !i.score)) {
				await scoresVoorstellen();
				if (scoresFout) return; // scoren mislukt → niet doorgaan
			}
			const alleRichtlijnen = [richtlijnen, extraRichtlijnen].filter((s) => s.trim()).join('\n\n');
			// ververs: true → de data herlaadt na afloop; de nieuwe concepten verschijnen
			// vanzelf (ook als je intussen naar een ander tabje bent gegaan).
			await postJSON(
				'/api/concepts',
				{
					type: 'genereer',
					clientId: data.client.id,
					richtlijnen: alleRichtlijnen,
					config: huidigeConfig()
				},
				{ taak: 'Matrix genereren', ververs: true }
			);
		} catch (e) {
			genereerFout = e instanceof Error ? e.message : 'Genereren mislukt';
		} finally {
			bezigGenereren = false;
		}
	}

	// ---- Afstem-interview: plan van aanpak → feedback → goedkeuren → matrix ----
	let plan = $state<StrategiePlan | null>(null);
	let bezigPlan = $state(false);
	let planFout = $state<string | null>(null);
	let planFeedback = $state('');
	let bezigGoedkeuren = $state(false);

	async function stelPlanOp(feedback = '') {
		bezigPlan = true;
		planFout = null;
		try {
			const { plan: p } = await postJSON<{ plan: StrategiePlan }>(
				'/api/strategie',
				{ type: 'plan', clientId: data.client.id, config: huidigeConfig(), feedback },
				{ taak: 'Plan van aanpak opstellen' }
			);
			plan = p;
		} catch (e) {
			planFout = e instanceof Error ? e.message : 'Plan van aanpak opstellen mislukt';
		} finally {
			bezigPlan = false;
		}
	}
	async function verfijnPlan() {
		if (!planFeedback.trim()) return;
		await stelPlanOp(planFeedback);
		if (!planFout) planFeedback = '';
	}
	async function keurGoedEnGenereer() {
		if (!plan) return;
		bezigGoedkeuren = true;
		planFout = null;
		try {
			await postJSON('/api/strategie', { type: 'goedkeuren', clientId: data.client.id, plan });
		} catch (e) {
			planFout = e instanceof Error ? e.message : 'Goedkeuren mislukt';
			bezigGoedkeuren = false;
			return;
		}
		bezigGoedkeuren = false;
		// Het goedgekeurde plan als strikte sturing meegeven → matrix consistent met het plan.
		const planContext =
			'## Afgestemd plan van aanpak (VOLG DIT strikt)\n' +
			`${plan.samenvatting}\nDoelgroep: ${plan.doelgroep}\nFunnelaanpak: ${plan.funnelaanpak}\n` +
			'Teststructuur:\n' +
			plan.sprints
				.map((s) => `- ${s.titel}: invalshoeken ${(s.concepten ?? []).join(', ')} — ${s.wat_testen}`)
				.join('\n');
		startGenereren(planContext, true);
	}

	// ---- Rijen slepen om te herordenen (handmatige testvolgorde) ----
	let sleepId = $state<string | null>(null);
	let sleepOverId = $state<string | null>(null);

	function opDragStart(id: string, e: DragEvent) {
		sleepId = id;
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function opDragOver(id: string, e: DragEvent) {
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		sleepOverId = id;
	}
	function opDragEnd() {
		sleepId = null;
		sleepOverId = null;
	}
	function opDrop(doelId: string) {
		const bron = sleepId;
		sleepId = null;
		sleepOverId = null;
		if (!bron || bron === doelId) return;
		const lijst = actief.map((c) => c.id);
		const van = lijst.indexOf(bron);
		const naar = lijst.indexOf(doelId);
		if (van < 0 || naar < 0) return;
		lijst.splice(naar, 0, ...lijst.splice(van, 1));
		// Nieuwe volgorde lokaal toepassen (derived hersorteert) + persisteren.
		lijst.forEach((id, i) => {
			const c = concepten.find((x) => x.id === id);
			if (c) c.volgorde = i;
		});
		postJSON('/api/concepts', { type: 'herorden', ids: lijst });
	}

	const statusKleur: Record<string, string> = {
		Idee: 'border-border bg-muted text-muted-foreground',
		'In productie': 'border-amber-300 bg-amber-100 text-amber-800',
		Live: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green',
		Afgerond: 'border-blue-300 bg-blue-100 text-blue-800'
	};
</script>

{#snippet selectCel(c: Concept, veld: keyof Concept, opties: readonly string[], nullable: boolean)}
	<select bind:value={c[veld]} onchange={() => saveVeld(c, veld)} class={veldClass}>
		{#if nullable}<option value={null}>—</option>{/if}
		{#each opties as o (o)}<option value={o}>{o}</option>{/each}
	</select>
{/snippet}

{#snippet inputCel(c: Concept, veld: keyof Concept, placeholder: string)}
	<input
		bind:value={c[veld]}
		onblur={() => saveVeld(c, veld)}
		{placeholder}
		class={veldClass}
	/>
{/snippet}

<!-- Meegroeiend tekstveld voor lange waarden (invalshoek, hypothese) — tekst breekt om -->
{#snippet textareaCel(c: Concept, veld: keyof Concept, placeholder: string, max: number)}
	<textarea
		bind:value={c[veld]}
		onblur={() => saveVeld(c, veld)}
		{placeholder}
		rows="1"
		use:autogrow={max}
		class={veldClassTa}
	></textarea>
{/snippet}

<!-- Combobox: kies een suggestie of typ een eigen waarde -->
{#snippet comboCel(c: Concept, veld: keyof Concept, listId: string)}
	<input
		list={listId}
		bind:value={c[veld]}
		onblur={() => saveVeld(c, veld)}
		placeholder="—"
		class={veldClass}
	/>
{/snippet}

<datalist id="dl-format">
	{#each FORMATS as o (o)}<option value={o}></option>{/each}
</datalist>
<datalist id="dl-structuur">
	{#each STRUCTUREN as o (o)}<option value={o}></option>{/each}
</datalist>
<datalist id="dl-variabele">
	{#each TEST_VARIABELEN as o (o)}<option value={o}></option>{/each}
</datalist>

<div class="space-y-5">
	<!-- Kop -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Variabelenmatrix</h2>
			<p class="text-sm text-muted-foreground">
				Bouw je concepten en bepaal per concept welke variabele je test.
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
			{#if data.heeftTriggerMap && actief.length > 0}
				<Button variant="outline" onclick={() => startGenereren()} disabled={bezigGenereren}>
					{#if bezigGenereren}
						<LoaderCircle class="size-4 animate-spin" />
						Genereren…
					{:else}
						<Sparkles class="size-4" />
						Opzet genereren
					{/if}
				</Button>
			{/if}
			<Button onclick={rijToevoegen}>
				<Plus class="size-4" />
				Concept toevoegen
			</Button>
		</div>
	</div>

	{#if genereerFout}
		<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			<TriangleAlert class="size-4 shrink-0" />
			{genereerFout}
		</div>
	{/if}

	<!-- Plan van aanpak (afstem-interview vóór de matrix) -->
	{#if data.heeftTriggerMap}
		<section
			class="space-y-4 rounded-lg border border-brand-lime/40 bg-brand-mint/20 p-4"
			data-tour-order="1"
			data-tour-title="Plan van aanpak"
			data-tour-text="Vóór de matrix stem je de strategie af: kies persona's, funnellagen, middelen en je doel/KPI, laat de AI Content Strategy Expert een plan voorstellen, geef feedback en keur goed. Pas dan rollen matrix én testplan consistent uit — schoon testen, één variabele per test."
		>
			<div>
				<h3 class="text-base font-semibold">Plan van aanpak</h3>
				<p class="text-sm text-muted-foreground">
					Stem eerst de teststrategie af met de AI Content Strategy Expert — geef feedback, keur goed, en
					genereer de matrix pas daarna. Zo klopt de matrix meteen en hoef je 'm niet meer te tweaken.
				</p>
			</div>

			<!-- Teststrategie (scope & middelen) -->
			<div class="rounded-md border bg-background p-3">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 text-sm font-medium"
					onclick={() => (toonStrategie = !toonStrategie)}
				>
					<span>
						Teststrategie (optioneel)
						<span class="font-normal text-muted-foreground">— persona's, funnel, middelen, doel & meer</span>
						{#if configActief}
							<span class="ml-1 text-brand-green">· actief</span>
						{/if}
					</span>
					<ChevronDown class={cn('size-4 shrink-0 transition-transform', toonStrategie && 'rotate-180')} />
				</button>
				{#if toonStrategie}
					<div class="mt-3 space-y-4 text-sm">
						<p class="text-xs text-muted-foreground">
							Laat leeg = geen beperking. Kies je iets, dan houdt de strategie zich daar strikt aan.
						</p>
						{#if personaNamen.length}
							<div>
								<span class="mb-1.5 block font-medium">Persona's</span>
								<div class="flex flex-wrap gap-1.5">
									{#each personaNamen as p (p)}
										<button type="button" class={chipClass(cfgPersonas.includes(p))} onclick={() => (cfgPersonas = toggleIn(cfgPersonas, p))}>
											{p}
										</button>
									{/each}
								</div>
							</div>
						{/if}
						<div>
							<span class="mb-1.5 block font-medium">Funnellagen</span>
							<div class="flex flex-wrap gap-1.5">
								{#each FUNNELFASES as f (f)}
									<button type="button" class={chipClass(cfgFunnels.includes(f))} onclick={() => (cfgFunnels = toggleIn(cfgFunnels, f))}>
										{f}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<span class="mb-1.5 block font-medium">Beschikbare middelen (formats)</span>
							<div class="flex flex-wrap gap-1.5">
								{#each FORMATS as m (m)}
									<button type="button" class={chipClass(cfgMiddelen.includes(m))} onclick={() => (cfgMiddelen = toggleIn(cfgMiddelen, m))}>
										{m}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<span class="mb-1.5 block font-medium">Doelstelling / KPI</span>
							<div class="flex flex-wrap gap-1.5">
								{#each DOELSTELLINGEN as d (d)}
									<button type="button" class={chipClass(cfgDoel === d)} onclick={() => (cfgDoel = cfgDoel === d ? '' : d)}>
										{d}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<span class="mb-1.5 block font-medium">Concreet target (optioneel)</span>
							<Input
								bind:value={cfgTarget}
								placeholder="Bijv. streef-ROAS 3, max CPA €30, of 'zoveel mogelijk aankopen/ATC'"
							/>
						</div>
						<div class="flex flex-wrap items-end gap-6">
							<div>
								<span class="mb-1.5 block font-medium">Max varianten per test</span>
								<div class="flex gap-1.5">
									{#each MAX_VARIANTEN_OPTIES as n (n)}
										<button type="button" class={chipClass(cfgMaxVarianten === n)} onclick={() => (cfgMaxVarianten = n)}>
											{n}
										</button>
									{/each}
								</div>
							</div>
							<label class="flex cursor-pointer items-center gap-2 py-1.5">
								<input type="checkbox" bind:checked={cfgParallel} class="size-4 accent-[var(--brand-green)]" />
								<span>Parallel testen toestaan (funnellagen tegelijk)</span>
							</label>
						</div>
					</div>
				{/if}
			</div>

			{#if planFout}
				<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{planFout}
				</div>
			{/if}

			{#if bezigPlan && !plan}
				<div class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-background py-10 text-center">
					<LoaderCircle class="size-6 animate-spin text-primary" />
					<p class="text-sm font-medium">De AI Content Strategy Expert stelt een plan op…</p>
				</div>
			{:else if !plan}
				<Button onclick={() => stelPlanOp()} disabled={bezigPlan}>
					<Sparkles class="size-4" />
					Plan van aanpak opstellen
				</Button>
			{:else}
				<!-- Plan-weergave -->
				<div class="space-y-3 rounded-md border bg-background p-3 text-sm">
					<p>{plan.samenvatting}</p>
					<p><span class="font-medium">Doelgroep:</span> {plan.doelgroep}</p>
					<p><span class="font-medium">Funnelaanpak:</span> {plan.funnelaanpak}</p>
					<div class="space-y-2">
						{#each plan.sprints as s, i (i)}
							<div class="rounded-md border p-2.5">
								<div class="flex items-center gap-2">
									<span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-green text-[11px] font-semibold text-white">
										{i + 1}
									</span>
									<span class="font-medium">{s.titel}</span>{#if s.ronde}<span class="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Ronde {s.ronde}</span>{/if}
								</div>
								{#if s.focus}<p class="mt-0.5 text-xs text-muted-foreground">{s.focus}</p>{/if}
								{#if s.concepten?.length}
									<div class="mt-1.5 flex flex-wrap gap-1">
										{#each s.concepten as c (c)}
											<span class="rounded bg-muted px-1.5 py-0.5 text-xs">{c}</span>
										{/each}
									</div>
								{/if}
								{#if s.wat_testen}<p class="mt-1.5"><span class="text-muted-foreground">Wat testen:</span> {s.wat_testen}</p>{/if}
								<p class="mt-0.5 text-xs text-muted-foreground">
									{[s.succescriterium && `Succes: ${s.succescriterium}`, s.budget && `Budget: ${s.budget}`, s.duur && `Duur: ${s.duur}`].filter(Boolean).join(' · ')}
								</p>
							</div>
						{/each}
					</div>
					{#if plan.aannames?.length}
						<div>
							<p class="font-medium">Aannames</p>
							<ul class="mt-1 space-y-0.5">
								{#each plan.aannames as a (a)}
									<li class="flex gap-2"><span class="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground"></span><span>{a}</span></li>
								{/each}
							</ul>
						</div>
					{/if}
				</div>

				<!-- Feedback + acties -->
				<div class="space-y-2">
					<Textarea
						bind:value={planFeedback}
						rows={2}
						placeholder={'Feedback op het plan… (bijv. "begin met BOFU", "voeg persona X toe", "alleen video")'}
					/>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" onclick={verfijnPlan} disabled={bezigPlan || bezigGoedkeuren || !planFeedback.trim()}>
							{#if bezigPlan}
								<LoaderCircle class="size-4 animate-spin" /> Verfijnen…
							{:else}
								<Sparkles class="size-4" /> Verfijn met feedback
							{/if}
						</Button>
						<Button onclick={keurGoedEnGenereer} disabled={bezigPlan || bezigGoedkeuren}>
							{#if bezigGoedkeuren}
								<LoaderCircle class="size-4 animate-spin" /> Matrix genereren…
							{:else}
								<Check class="size-4" /> Goedkeuren & matrix genereren
							{/if}
						</Button>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Test-backlog: geprioriteerde invalshoeken uit de trigger map (inklapbaar) -->
	{#if data.heeftTriggerMap}
		<section
			class="rounded-lg border"
			data-tour-order="2"
			data-tour-title="Test-backlog"
			data-tour-text="De invalshoeken uit je trigger map, automatisch geprioriteerd op RICE (Bereik · Impact · Bewijskracht ÷ Effort). De bovenste test je als eerste; je kunt scores bijstellen."
		>
			<button
				type="button"
				class="flex w-full items-center gap-2 p-4 text-left"
				onclick={() => (backlogOpen = !backlogOpen)}
			>
				<ListOrdered class="size-4 shrink-0 text-brand-green" />
				<span class="text-base font-semibold">Test-backlog</span>
				<Badge variant="outline" class="text-muted-foreground">{backlog.length}</Badge>
				{#if !backlogOpen && backlog[0]}
					<span class="truncate text-sm text-muted-foreground">
						· volgende: {backlog[0].naam || '(naamloos)'}
					</span>
				{/if}
				<ChevronDown
					class={cn(
						'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
						backlogOpen && 'rotate-180'
					)}
				/>
			</button>

			{#if backlogOpen}
				<div class="space-y-3 border-t p-4 pt-3">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<p class="max-w-xl text-sm text-muted-foreground">
							Invalshoeken uit je trigger map, automatisch geprioriteerd (RICE-light: Bereik · Impact ·
							Bewijskracht ÷ Effort). De bovenste test je als eerste.
						</p>
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" onclick={scoresVoorstellen} disabled={bezigScores || !versieId}>
								{#if bezigScores}
									<LoaderCircle class="size-4 animate-spin" /> Scoren…
								{:else}
									<Sparkles class="size-4" /> Scores opnieuw voorstellen
								{/if}
							</Button>
							<Button variant="ghost" size="sm" onclick={invToevoegen} disabled={!versieId}>
								<Plus class="size-4" /> Invalshoek
							</Button>
						</div>
					</div>

					{#if scoresFout}
				<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{scoresFout}
				</div>
			{/if}

			{#if backlog.length === 0}
				<p class="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
					Nog geen invalshoeken. Ze worden bij het genereren van de trigger map opgesteld en
					geprioriteerd — of voeg er handmatig één toe.
				</p>
			{:else}
				<ol class="space-y-2">
					{#each backlog as inv, i (inv)}
						{@const open = uitgeklapteInv.has(inv)}
						<li class="rounded-md border">
							<!-- Samenvattingsrij -->
							<div class="flex flex-wrap items-center gap-2 p-2.5">
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
								>
									{i + 1}
								</span>
								{#if inv.score}
									<Badge variant="outline" class={cn('font-medium', prioriteitKleur[afgeleidePrioriteit(inv.score)])}>
										{afgeleidePrioriteit(inv.score)}
									</Badge>
								{:else}
									<Badge variant="outline" class="text-muted-foreground">niet gescoord</Badge>
								{/if}
								<Badge variant="outline" class={cn('font-medium', funnelKleur[inv.funnelfase])}>
									{inv.funnelfase}
								</Badge>
								<span class="font-medium">{inv.naam || '(naamloos)'}</span>
								<Badge
									variant="outline"
									class={cn('ml-auto font-medium', invStatusKleur[invalshoekStatus(inv)])}
								>
									{invalshoekStatus(inv)}
								</Badge>
								<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={() => toggleInv(inv)}>
									Bijstellen
									<ChevronDown class={cn('size-4 transition-transform', open && 'rotate-180')} />
								</Button>
							</div>

							<!-- Score-detail (samengevat, wanneer ingeklapt) -->
							{#if !open}
								<div class="border-t px-2.5 py-2 text-xs text-muted-foreground">
									{#if inv.score}
										<span class="text-foreground">
											Bereik {inv.score.bereik} · Impact {inv.score.impact} · Bewijskracht {inv.score
												.bewijskracht} · Effort {inv.score.effort}
										</span>
										{#if inv.score.toelichting}<span> — {inv.score.toelichting}</span>{/if}
									{:else if inv.omschrijving}
										{inv.omschrijving}
									{/if}
								</div>
							{/if}

							<!-- Bijstellen (uitgeklapt) -->
							{#if open}
								<div class="space-y-3 border-t bg-muted/20 p-3">
									<div class="flex items-center gap-2">
										<Input bind:value={inv.naam} onblur={saveInvalshoeken} placeholder="Naam invalshoek" />
										<Button
											variant="ghost"
											size="sm"
											class="shrink-0 text-muted-foreground hover:text-destructive"
											title="Verwijderen"
											onclick={() => invVerwijderen(inv)}
										>
											<Trash2 class="size-4" />
										</Button>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<div>
											<span class="mb-1 block text-xs font-medium text-muted-foreground">Fase</span>
											<select bind:value={inv.funnelfase} onchange={saveInvalshoeken} class={veldClass}>
												{#each FUNNELFASES as f (f)}<option value={f}>{f}</option>{/each}
											</select>
										</div>
										<div>
											<span class="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
											<select
												value={invalshoekStatus(inv)}
												onchange={(e) => {
													inv.status = e.currentTarget.value as Invalshoek['status'];
													saveInvalshoeken();
												}}
												class={veldClass}
											>
												{#each INVALSHOEK_STATUSSEN as s (s)}<option value={s}>{s}</option>{/each}
											</select>
										</div>
									</div>
									<div>
										<span class="mb-1 block text-xs font-medium text-muted-foreground">Omschrijving</span>
										<Textarea bind:value={inv.omschrijving} onblur={saveInvalshoeken} rows={2} />
									</div>
									<div>
										<span class="mb-1 block text-xs font-medium text-muted-foreground">Onderbouwing</span>
										<Textarea bind:value={inv.onderbouwing} onblur={saveInvalshoeken} rows={2} />
									</div>

									<!-- RICE-light scorekaart -->
									<div class="space-y-2 rounded-md border border-dashed bg-background p-2.5">
										<div class="flex items-center justify-between gap-2">
											<span class="text-xs font-semibold text-muted-foreground">Scorekaart</span>
											{#if inv.score}
												<Badge
													variant="outline"
													class={cn('font-medium', prioriteitKleur[afgeleidePrioriteit(inv.score)])}
												>
													Prioriteit: {afgeleidePrioriteit(inv.score)}
												</Badge>
											{:else}
												<span class="text-xs text-muted-foreground">nog niet gescoord</span>
											{/if}
										</div>
										<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
											{#each SCORE_FACTOREN as f (f.key)}
												<div>
													<span class="mb-0.5 block text-xs text-muted-foreground" title={f.hint}>{f.label}</span>
													<select
														value={inv.score?.[f.key] ?? ''}
														onchange={(e) => setInvScore(inv, f.key, e.currentTarget.value as ScoreNiveau)}
														class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
													>
														<option value="" disabled>—</option>
														{#each SCORE_NIVEAUS as n (n)}<option value={n}>{n}</option>{/each}
													</select>
												</div>
											{/each}
										</div>
										{#if inv.score?.toelichting}
											<p class="text-xs text-muted-foreground">{inv.score.toelichting}</p>
										{/if}
									</div>

									<Button
										variant="ghost"
										size="sm"
										class="text-muted-foreground"
										onclick={() => invArchiveer(inv, true)}
									>
										<Archive class="size-4" /> Archiveren
									</Button>
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}

			<!-- Backlog-archief -->
			{#if backlogArchief.length > 0}
				<div>
					<button
						type="button"
						class="text-sm font-medium text-muted-foreground hover:text-foreground"
						onclick={() => (toonBacklogArchief = !toonBacklogArchief)}
					>
						{toonBacklogArchief ? 'Verberg' : 'Toon'} gearchiveerd ({backlogArchief.length})
					</button>
					{#if toonBacklogArchief}
						<div class="mt-2 space-y-2">
							{#each backlogArchief as inv (inv)}
								<div class="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
									<span>
										{inv.naam || '(naamloos)'}
										<span class="text-muted-foreground">· {inv.funnelfase}</span>
									</span>
									<Button variant="ghost" size="sm" onclick={() => invArchiveer(inv, false)}>
										<ArchiveRestore class="size-4" /> Herstellen
									</Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Testvolgorde-indicator -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-brand-lime/40 bg-brand-mint/50 px-3 py-2 text-sm"
	>
		<span class="font-medium text-brand-green">Test eerst:</span>
		{#each TESTVOLGORDE as stap, i (stap)}
			<span class="font-medium text-foreground">{stap}</span>
			{#if i < TESTVOLGORDE.length - 1}<span class="text-muted-foreground">→</span>{/if}
		{/each}
	</div>

	<!-- Extra sturing voor de generatie -->
	{#if data.heeftTriggerMap}
		<div>
			<button
				type="button"
				class="text-sm font-medium text-muted-foreground hover:text-foreground"
				onclick={() => (toonRichtlijnen = !toonRichtlijnen)}
			>
				{toonRichtlijnen ? '−' : '+'} Extra sturing meegeven aan "Opzet genereren"{richtlijnen.trim()
					? ' (actief)'
					: ' (optioneel)'}
			</button>
			{#if toonRichtlijnen}
				<Textarea
					class="mt-2"
					bind:value={richtlijnen}
					rows={3}
					placeholder={'Bijv. "test ook de benaming: insuline vs. medicatie", "varieer gezicht-in-beeld vs. geen gezicht", "focus op de reis/vakantie-context"…'}
				/>
				<p class="mt-1 text-xs text-muted-foreground">
					Claude neemt dit expliciet mee in de concepten en prioriteit bij de volgende generatie.
				</p>
			{/if}
		</div>
	{/if}

	<!-- Spar-modus: overleg met de strateeg, voer daarna pas door -->
	{#if data.heeftTriggerMap}
		<SparPaneel
			clientId={data.client.id}
			onderwerp="matrix"
			startBerichten={data.sparBerichten}
			context={sparContext}
			onToepassen={(sturing) => startGenereren(sturing)}
			titel="Spar over de matrix"
			intro={'Overleg met de AI-strateeg over de opzet — stel vragen, doe suggesties, bespreek twijfels (bijv. creator type, persona-verdeling). Er verandert niets aan de matrix tot je op "Voer besproken wijzigingen door" klikt; dan hergenereert de matrix op basis van jullie gesprek.'}
		/>
	{/if}

	<!-- Voorstel uit trigger map -->
	{#if bezigGenereren && actief.length === 0}
		<div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-16 text-center">
			<LoaderCircle class="size-6 animate-spin text-primary" />
			<p class="text-sm font-medium">Claude stelt een matrix-opzet voor…</p>
			<p class="text-xs text-muted-foreground">Dit kan een halve minuut duren.</p>
		</div>
	{:else if actief.length === 0 && data.heeftTriggerMap}
		<div class="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
			<Sparkles class="mx-auto size-6 text-accent" />
			<p class="mt-2 text-sm font-medium">Genereer een matrix-opzet uit je trigger map</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Claude stelt een set concepten voor (funnelfase, invalshoek, format, structuur, hypothese) op
				basis van je trigger map. Je kunt alles daarna vrij aanpassen.
			</p>
			<div class="mt-4 flex flex-wrap justify-center gap-2">
				<Button onclick={() => startGenereren()} disabled={bezigGenereren}>
					<Sparkles class="size-4" />
					Matrix-opzet genereren
				</Button>
				{#if overneembareInvalshoeken.length > 0}
					<Button variant="outline" onclick={neemInvalshoekenOver}>
						Alleen de invalshoeken overnemen ({overneembareInvalshoeken.length})
					</Button>
				{/if}
			</div>
		</div>
	{:else if actief.length === 0}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<p class="text-sm font-medium text-foreground">Nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Genereer eerst een <strong>trigger map</strong> — daaruit stelt Claude automatisch een
				matrix-opzet voor. Of voeg handmatig een concept toe.
			</p>
		</div>
	{/if}

	<!-- Tabel -->
	{#if actief.length > 0}
		<div
			class="overflow-x-auto rounded-lg border"
			data-tour-order="3"
			data-tour-title="De variabelenmatrix"
			data-tour-text="Je concrete testconcepten. Sleep rijen (⠿) om de testvolgorde te bepalen; per rij zie je funnelfase, invalshoek, format, hypothese en prioriteit. Dit is de uitvoerlijst voor je sprints."
		>
			<table class="w-full min-w-[1180px] border-collapse text-sm">
				<thead>
					<tr class="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
						<th class="w-7 p-2"></th>
						<th class="w-24 p-2">Funnelfase</th>
						<th class="w-56 p-2">Invalshoek</th>
						<th class="w-32 p-2">Format</th>
						<th class="w-40 p-2">Structuur</th>
						<th class="w-32 p-2">Creator type</th>
						<th class="w-64 p-2">Hypothese</th>
						<th class="w-32 p-2">Test-variabele</th>
						<th class="w-28 p-2">Prioriteit</th>
						<th class="w-32 p-2">Status</th>
						<th class="w-20 p-2 text-right">Acties</th>
					</tr>
				</thead>
				<tbody>
					{#each actief as c (c.id)}
						<tr
							class={cn(
								'border-b align-top',
								c.status === 'Live' && 'bg-brand-lime/5',
								sleepId === c.id && 'opacity-40',
								sleepOverId === c.id && sleepId !== c.id && 'border-t-2 border-t-brand-green'
							)}
							ondragover={(e) => opDragOver(c.id, e)}
							ondrop={() => opDrop(c.id)}
							ondragend={opDragEnd}
						>
							<td class="p-2">
								<button
									type="button"
									draggable="true"
									ondragstart={(e) => opDragStart(c.id, e)}
									ondragend={opDragEnd}
									title="Sleep om de testvolgorde te wijzigen"
									aria-label="Versleep rij"
									class="flex cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
								>
									<GripVertical class="size-4" />
								</button>
							</td>
							<td class="p-2">{@render selectCel(c, 'funnelfase', FUNNELFASES, true)}</td>
							<td class="p-2">{@render textareaCel(c, 'invalshoek', 'Invalshoek', 72)}</td>
							<td class="p-2">{@render comboCel(c, 'format', 'dl-format')}</td>
							<td class="p-2">{@render comboCel(c, 'structuur', 'dl-structuur')}</td>
							<td class="p-2">{@render inputCel(c, 'creator_type', 'Bijv. micro-influencer')}</td>
							<td class="p-2">{@render textareaCel(c, 'hypothese', 'Wat verwacht je?', 96)}</td>
							<td class="p-2">{@render comboCel(c, 'variabele', 'dl-variabele')}</td>
							<td class="p-2">{@render selectCel(c, 'prioriteit', PRIORITEITEN, true)}</td>
							<td class="p-2">{@render selectCel(c, 'status', CONCEPT_STATUSSEN, false)}</td>
							<td class="p-2">
								<div class="flex justify-end gap-1">
									{#if c.onderbouwing}
										<Button
											variant="ghost"
											size="sm"
											title="Waarom dit concept?"
											class={cn(
												'text-muted-foreground',
												uitgeklapt.has(c.id) && 'text-brand-green'
											)}
											onclick={() => toggleOnderbouwing(c.id)}
										>
											<Info class="size-4" />
										</Button>
									{/if}
									<Button
										variant="ghost"
										size="sm"
										title="Dupliceren"
										class="text-muted-foreground"
										onclick={() => dupliceer(c)}
									>
										<Copy class="size-4" />
									</Button>
									<Button
										variant="ghost"
										size="sm"
										title="Archiveren"
										class="text-muted-foreground hover:text-destructive"
										onclick={() => archiveer(c)}
									>
										<Archive class="size-4" />
									</Button>
								</div>
							</td>
						</tr>
						{#if uitgeklapt.has(c.id) && c.onderbouwing}
							<tr class="border-b bg-brand-mint/30">
								<td colspan="11" class="px-3 py-2">
									<p class="text-sm">
										<span class="font-semibold text-brand-green">Waarom dit concept:</span>
										{c.onderbouwing}
									</p>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Archief -->
	{#if archief.length > 0}
		<div>
			<button
				type="button"
				class="text-sm font-medium text-muted-foreground hover:text-foreground"
				onclick={() => (toonArchief = !toonArchief)}
			>
				{toonArchief ? 'Verberg' : 'Toon'} gearchiveerd ({archief.length})
			</button>
			{#if toonArchief}
				<div class="mt-2 space-y-2">
					{#each archief as c (c.id)}
						<div class="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
							<div class="flex items-center gap-2 text-sm">
								<Badge variant="outline" class={cn('font-medium', statusKleur[c.status])}>
									{c.status}
								</Badge>
								<span>{c.invalshoek || '(geen invalshoek)'}</span>
								{#if c.funnelfase}<span class="text-muted-foreground">· {c.funnelfase}</span>{/if}
							</div>
							<Button variant="ghost" size="sm" onclick={() => herstel(c)}>
								<ArchiveRestore class="size-4" />
								Herstellen
							</Button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- Testplan -->
	{#if actief.length > 0}
		<div class="space-y-4 border-t pt-6">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 class="text-base font-semibold">Testplan</h3>
					<p class="text-sm text-muted-foreground">
						Stap-voor-stap sprintplan op basis van je matrix en persona's — waarom je met welke test
						begint en wat de vervolgstappen zijn.
					</p>
				</div>
				<Button
					variant={testplan ? 'outline' : 'default'}
					onclick={genereerTestplan}
					disabled={bezigTestplan}
				>
					{#if bezigTestplan}
						<LoaderCircle class="size-4 animate-spin" />
						Genereren…
					{:else}
						<ClipboardList class="size-4" />
						{testplan ? 'Opnieuw genereren' : 'Testplan genereren'}
					{/if}
				</Button>
			</div>

			{#if testplanFout}
				<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{testplanFout}
				</div>
			{/if}

			{#if bezigTestplan && !testplan}
				<div class="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-12 text-center">
					<LoaderCircle class="size-6 animate-spin text-primary" />
					<p class="text-sm font-medium">Claude stelt een testplan op…</p>
				</div>
			{:else if !testplan}
				<div class="rounded-lg border border-dashed bg-muted/30 p-6 text-center">
					<ClipboardList class="mx-auto size-6 text-accent" />
					<p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
						Laat Claude een stap-voor-stap testplan opstellen op basis van de concepten hierboven en je
						persona's uit de trigger map.
					</p>
				</div>
			{/if}

			{#if testplan}
				<div class="rounded-md border border-brand-lime/40 bg-brand-mint/40 p-3 text-sm">
					{testplan.toelichting}
				</div>

				<div class="space-y-3">
					{#each testplan.sprints as s, i (i)}
						<div class="rounded-lg border p-4">
							<div class="flex items-center gap-2">
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-green text-xs font-semibold text-white"
								>
									{i + 1}
								</span>
								<h4 class="font-semibold">{s.titel}</h4>
							</div>
							<div class="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
								{#each SPRINT_VELDEN as veld (veld.key)}
									{#if s[veld.key]}
										<p>
											<span class="text-muted-foreground">{veld.label}:</span>
											{s[veld.key]}
										</p>
									{/if}
								{/each}
							</div>
							{#if s.concepten?.length}
								<div class="mt-2 flex flex-wrap gap-1.5">
									{#each s.concepten as c (c)}
										<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{c}</span>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<div class="space-y-2 rounded-lg border bg-muted/20 p-3">
					<span class="block text-sm font-medium">Niet mee eens of aanvullingen?</span>
					<Textarea
						bind:value={feedback}
						rows={2}
						placeholder="Bijv. 'begin met BOFU', 'voeg een aparte sprint voor persona X toe', 'lager budget in sprint 1'…"
					/>
					<Button
						variant="outline"
						size="sm"
						onclick={genereerTestplan}
						disabled={bezigTestplan || !feedback.trim()}
					>
						<Sparkles class="size-4" />
						Verfijn met feedback
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- 3-weg keuze bij genereren met bestaande concepten -->
{#if regenOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="button"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget && !bezigGenereren) regenOpen = false;
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !bezigGenereren) regenOpen = false;
		}}
	>
		<div class="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
			<h2 class="text-base font-semibold">Matrix genereren</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Er staan al concepten in de matrix. Wat wil je doen?
			</p>
			<div class="mt-4 flex flex-col gap-2">
				<Button onclick={() => bevestigRegen('opnieuw')} disabled={bezigGenereren}>
					Volledig opnieuw maken
					<span class="text-xs font-normal opacity-80">— bestaande archiveren</span>
				</Button>
				<Button variant="outline" onclick={() => bevestigRegen('toevoegen')} disabled={bezigGenereren}>
					Toevoegen aan bestaande
				</Button>
				<Button variant="ghost" onclick={() => (regenOpen = false)} disabled={bezigGenereren}>
					Annuleren
				</Button>
			</div>
		</div>
	</div>
{/if}
