<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Card from '$lib/components/ui/card';
	import { cn } from '$lib/utils';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { postJSON } from '$lib/saver.svelte';
	import { FORMATS, STRUCTUREN, TEST_VARIABELEN, CTA_SUGGESTIES } from '$lib/matrix';
	import { riceScore, afgeleidePrioriteit, type Invalshoek } from '$lib/trigger-map';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Plus from '@lucide/svelte/icons/plus';
	import Check from '@lucide/svelte/icons/check';
	import Target from '@lucide/svelte/icons/target';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { data } = $props();
	const clientId = $derived(page.params.id ?? '');
	const base = $derived(`/klanten/${clientId}`);

	const CREATORS_DEFAULT = ['Unisex', 'Man', 'Vrouw', 'Micro-influencer', 'Klant/UGC', 'Merk zelf', 'Geen persoon'];
	const HORIZONS = [
		{ label: '1 maand', n: 4 },
		{ label: '1 kwartaal', n: 12 },
		{ label: 'Half jaar', n: 24 }
	];

	// svelte-ignore state_referenced_locally
	let aanbodOpts = $state<string[]>([...data.aanbodOpties]);
	let creatorOpts = $state<string[]>([...CREATORS_DEFAULT]);

	let selAanbod = $state<string[]>([]);
	let selAngle = $state<string[]>([]); // namen
	let selFormat = $state<string[]>([]);
	let selCreator = $state<string[]>([]);

	let structuur = $state('');
	let cta = $state('');
	let testas = $state<string>('Invalshoek');
	let hooks = $state(3);
	let horizon = $state(12);

	let nieuwAanbod = $state('');
	let nieuwCreator = $state('');
	let bezig = $state(false);
	let fout = $state<string | null>(null);
	let resultAantal = $state<number | null>(null);

	const angles = $derived(data.invalshoeken as Invalshoek[]);
	function angleByName(naam: string): Invalshoek | undefined {
		return angles.find((a) => a.naam === naam);
	}
	function toggle(arr: string[], v: string): string[] {
		return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
	}

	const lines = $derived(selAanbod.length * selAngle.length * selFormat.length * selCreator.length);
	const hooksN = $derived(Math.max(1, Math.min(10, hooks || 1)));

	interface Combo { aanbod: string; angle: string; format: string; creator: string; funnelfase: string; score: number; }
	const combos = $derived.by<Combo[]>(() => {
		const out: Combo[] = [];
		for (const a of selAanbod)
			for (const g of selAngle) {
				const inv = angleByName(g);
				const sc = inv?.score ? riceScore(inv.score) : 5;
				for (const f of selFormat)
					for (const cr of selCreator)
						out.push({ aanbod: a, angle: g, format: f, creator: cr, funnelfase: inv?.funnelfase ?? 'TOFU', score: sc });
			}
		return out.sort((x, y) => y.score - x.score);
	});
	const focus = $derived(combos.slice(0, horizon));

	const verdict = $derived.by(() => {
		if (lines === 0) return { cls: 'text-muted-foreground', msg: 'Kies opties per dimensie.' };
		if (lines <= horizon)
			return { cls: 'text-brand-green', msg: `Mooi — ${lines} lijnen, past bij je horizon (~${horizon}).` };
		if (lines <= horizon * 1.5)
			return { cls: 'text-amber-700', msg: `Aan de ruime kant: ${lines} vs streef ~${horizon}. Prima als je verder vooruit wil.` };
		return { cls: 'text-destructive', msg: `Erg groot: ${lines} vs ~${horizon}. Focus de startset, of test minder assen tegelijk.` };
	});

	function voegAanbodToe() {
		const v = nieuwAanbod.trim();
		if (!v) return;
		if (!aanbodOpts.includes(v)) aanbodOpts.push(v);
		if (!selAanbod.includes(v)) selAanbod = [...selAanbod, v];
		nieuwAanbod = '';
	}
	function voegCreatorToe() {
		const v = nieuwCreator.trim();
		if (!v) return;
		if (!creatorOpts.includes(v)) creatorOpts.push(v);
		if (!selCreator.includes(v)) selCreator = [...selCreator, v];
		nieuwCreator = '';
	}

	// Bewustwordingsfase afgeleid van de funnelfase (indicatief).
	function awarenessVoor(f: string): string {
		return f === 'BOFU' ? 'Productbewust' : f === 'MOFU' ? 'Oplossingsbewust' : 'Probleembewust';
	}

	async function genereer(alle: boolean) {
		const bron = alle ? combos : focus;
		if (!bron.length) return;
		bezig = true;
		fout = null;
		resultAantal = null;
		try {
			const lijnen = bron.map((c) => {
				const inv = angleByName(c.angle);
				return {
					funnelfase: c.funnelfase,
					awareness: awarenessVoor(c.funnelfase),
					invalshoek: c.angle,
					aanbod: c.aanbod,
					format: c.format,
					creator_type: c.creator,
					structuur: structuur || null,
					cta: cta || null,
					variabele: testas,
					prioriteit: inv?.score ? afgeleidePrioriteit(inv.score) : null,
					onderbouwing: inv?.score?.toelichting ?? inv?.onderbouwing ?? null
				};
			});
			const res = await postJSON<{ aantal: number }>(
				'/api/concepts',
				{ type: 'genereer_set', clientId, lijnen },
				{ taak: 'Testruimte → matrix' }
			);
			resultAantal = res.aantal;
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Genereren mislukt';
		} finally {
			bezig = false;
		}
	}

	const chipCls = (on: boolean) =>
		cn(
			'rounded-full border px-3 py-1.5 text-sm transition-colors',
			on
				? 'border-brand-green bg-brand-mint/60 font-medium text-brand-green'
				: 'border-input text-muted-foreground hover:bg-muted'
		);
	const funnelKleur: Record<string, string> = {
		TOFU: 'text-blue-700',
		MOFU: 'text-amber-700',
		BOFU: 'text-brand-green'
	};
	const veld = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Testruimte</h2>
			<p class="max-w-2xl text-sm text-muted-foreground">
				Kies wat je deze ronde test. De tool rekent live mee en houdt je bij een gefocuste, testbare
				set — geen berg van honderd video's. Jij bepaalt zelf welke as je test.
			</p>
		</div>
	</div>

	{#if !data.heeftTriggerMap}
		<div class="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
			<TriangleAlert class="size-4 shrink-0" />
			Maak eerst een <strong>trigger map</strong> — daaruit komen de invalshoeken (angles).
			<a href={`${base}/triggermap`} class="font-medium underline">Naar Trigger Map</a>
		</div>
	{:else}
		<div class="grid gap-5 lg:grid-cols-[1fr_340px]">
			<!-- Picker -->
			<Card.Root>
				<Card.Content class="divide-y p-0">
					<!-- Aanbod -->
					<div class="space-y-2 p-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Aanbod</span>
							<span class="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">multiplier</span>
							<span class="ml-auto text-xs text-muted-foreground">{selAanbod.length} gekozen</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each aanbodOpts as o (o)}
								<button type="button" class={chipCls(selAanbod.includes(o))} onclick={() => (selAanbod = toggle(selAanbod, o))}>{o}</button>
							{/each}
							{#if aanbodOpts.length === 0}
								<span class="text-xs text-muted-foreground">Nog geen aanbod bekend — voeg hieronder toe.</span>
							{/if}
						</div>
						<div class="flex gap-2 pt-1">
							<Input bind:value={nieuwAanbod} placeholder="Aanbod toevoegen (bijv. Longsleeve, Belastingaangifte)" onkeydown={(e) => e.key === 'Enter' && voegAanbodToe()} class="h-8" />
							<Button variant="outline" size="sm" onclick={voegAanbodToe}><Plus class="size-4" /></Button>
						</div>
						<p class="text-xs text-muted-foreground">Elke extra aanbod-keuze vermenigvuldigt álles. Kies bewust.</p>
					</div>

					<!-- Invalshoek -->
					<div class="space-y-2 p-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Invalshoek (angle)</span>
							<span class="rounded bg-brand-mint px-1.5 py-0.5 text-[11px] font-medium text-brand-green">strategisch</span>
							<span class="ml-auto text-xs text-muted-foreground">{selAngle.length} gekozen</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each angles as a (a.naam)}
								<button type="button" class={chipCls(selAngle.includes(a.naam))} onclick={() => (selAngle = toggle(selAngle, a.naam))}>
									<span class={cn('mr-1 text-[10px] font-semibold', funnelKleur[a.funnelfase])}>{a.funnelfase}</span>
									{a.naam || '(naamloos)'}
								</button>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">De trigger per persona — uit je trigger map.</p>
					</div>

					<!-- Format -->
					<div class="space-y-2 p-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Format</span>
							<span class="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">productie</span>
							<span class="ml-auto text-xs text-muted-foreground">{selFormat.length} gekozen</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each FORMATS as o (o)}
								<button type="button" class={chipCls(selFormat.includes(o))} onclick={() => (selFormat = toggle(selFormat, o))}>{o}</button>
							{/each}
						</div>
					</div>

					<!-- Creator -->
					<div class="space-y-2 p-4">
						<div class="flex items-center gap-2">
							<span class="font-medium">Creator</span>
							<span class="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">productie</span>
							<span class="ml-auto text-xs text-muted-foreground">{selCreator.length} gekozen</span>
						</div>
						<div class="flex flex-wrap gap-2">
							{#each creatorOpts as o (o)}
								<button type="button" class={chipCls(selCreator.includes(o))} onclick={() => (selCreator = toggle(selCreator, o))}>{o}</button>
							{/each}
						</div>
						<div class="flex gap-2 pt-1">
							<Input bind:value={nieuwCreator} placeholder="Creator toevoegen" onkeydown={(e) => e.key === 'Enter' && voegCreatorToe()} class="h-8" />
							<Button variant="outline" size="sm" onclick={voegCreatorToe}><Plus class="size-4" /></Button>
						</div>
					</div>

					<!-- Vaste keuzes + hook -->
					<div class="grid gap-4 p-4 sm:grid-cols-2">
						<label class="space-y-1 text-sm">
							<span class="block text-xs font-medium text-muted-foreground">Structuur (toegepast op alle)</span>
							<select bind:value={structuur} class={cn(veld, 'w-full')}>
								<option value="">—</option>
								{#each STRUCTUREN as o (o)}<option value={o}>{o}</option>{/each}
							</select>
						</label>
						<label class="space-y-1 text-sm">
							<span class="block text-xs font-medium text-muted-foreground">CTA (vast)</span>
							<select bind:value={cta} class={cn(veld, 'w-full')}>
								<option value="">—</option>
								{#each CTA_SUGGESTIES as o (o)}<option value={o}>{o}</option>{/each}
							</select>
						</label>
						<label class="space-y-1 text-sm">
							<span class="block text-xs font-medium text-muted-foreground">Wat test je deze ronde? (testas)</span>
							<select bind:value={testas} class={cn(veld, 'w-full')}>
								{#each TEST_VARIABELEN as o (o)}<option value={o}>{o}</option>{/each}
							</select>
						</label>
						<label class="space-y-1 text-sm">
							<span class="block text-xs font-medium text-muted-foreground">Hooks per lijn (1–10, goedkope sub-variant)</span>
							<input type="number" min="1" max="10" bind:value={hooks} class={cn(veld, 'w-full')} />
						</label>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Teller + focus -->
			<div class="space-y-4 lg:sticky lg:top-4 lg:self-start">
				<Card.Root>
					<Card.Content class="space-y-2 p-4">
						<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Te produceren lijnen</span>
						<div class="text-4xl font-bold tabular-nums">{lines} <span class="text-base font-medium text-muted-foreground">lijnen</span></div>
						{#if lines > 0}
							<p class="text-xs tabular-nums text-muted-foreground">{selAanbod.length} aanbod × {selAngle.length} angle × {selFormat.length} format × {selCreator.length} creator</p>
						{/if}
						<div class="h-2 overflow-hidden rounded-full bg-muted">
							<div class="h-full rounded-full transition-all" style="width:{Math.min(100, (horizon ? lines / horizon : 0) * 100)}%; background:{lines === 0 ? 'transparent' : lines <= horizon ? '#2f7d46' : lines <= horizon * 1.5 ? '#dd9a2e' : '#d1573c'}"></div>
						</div>
						<p class={cn('text-sm font-medium', verdict.cls)}>{verdict.msg}</p>
						<p class="tabular-nums text-xs text-muted-foreground">→ <strong>{lines * hooksN} test-varianten</strong> incl. hooks</p>

						<div class="space-y-1.5 pt-2">
							<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hoe ver vooruit?</span>
							<div class="flex gap-1.5">
								{#each HORIZONS as h (h.n)}
									<button type="button" class={cn('flex-1 rounded-md border px-2 py-1.5 text-xs font-medium', horizon === h.n ? 'border-brand-green bg-brand-mint/60 text-brand-green' : 'border-input text-muted-foreground hover:bg-muted')} onclick={() => (horizon = h.n)}>{h.label}</button>
								{/each}
							</div>
							<p class="text-xs text-muted-foreground">Streef: <strong>{horizon} lijnen</strong>. Geen harde limiet.</p>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root>
					<Card.Content class="space-y-2 p-4">
						<h4 class="flex items-center gap-1.5 text-sm font-semibold"><Target class="size-4 text-brand-green" /> Aanbevolen startset <span class="font-normal text-muted-foreground">· op RICE</span></h4>
						{#if focus.length === 0}
							<p class="text-xs text-muted-foreground">Zodra je kiest, zet de tool hier de kansrijkste lijnen bovenaan.</p>
						{:else}
							<ol class="space-y-1.5">
								{#each focus as c, i (i)}
									<li class="flex items-center gap-2 border-b border-dashed py-1.5 last:border-0">
										<span class="flex size-5 shrink-0 items-center justify-center rounded bg-brand-green text-[11px] font-semibold text-white">{i + 1}</span>
										<span class="min-w-0 text-xs leading-tight">
											<span class="font-medium">{c.angle} · {c.format}</span><br />
											<span class="text-muted-foreground">{c.aanbod} · {c.creator}</span>
										</span>
										<span class="ml-auto shrink-0 rounded bg-brand-mint px-1.5 py-0.5 text-[11px] font-semibold text-brand-green">{c.score}</span>
									</li>
								{/each}
							</ol>
							{#if combos.length > horizon}
								<p class="pt-1 text-center text-xs text-muted-foreground">+{combos.length - horizon} lijnen buiten focus — bewaard voor latere rondes</p>
							{/if}
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- Genereren -->
				<div class="space-y-2">
					{#if fout}
						<p class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"><TriangleAlert class="size-4 shrink-0" />{fout}</p>
					{/if}
					{#if resultAantal !== null}
						<div class="space-y-2 rounded-md border border-brand-lime/40 bg-brand-mint/50 p-3">
							<p class="flex items-center gap-2 text-sm text-brand-green"><Check class="size-4 shrink-0" />{resultAantal} concepten in de matrix gezet.</p>
							<Button size="sm" onclick={() => goto(`${base}/matrix`)}>Bekijk in de Matrix <ArrowRight class="size-4" /></Button>
						</div>
					{/if}
					<Button class="w-full" disabled={bezig || focus.length === 0} onclick={() => genereer(false)}>
						{#if bezig}<LoaderCircle class="size-4 animate-spin" />{:else}<Sparkles class="size-4" />{/if}
						Genereer aanbevolen focus ({Math.min(focus.length, horizon)})
					</Button>
					{#if combos.length > horizon}
						<Button variant="outline" class="w-full" disabled={bezig} onclick={() => genereer(true)}>Genereer hele selectie ({combos.length})</Button>
					{/if}
					<p class="text-center text-xs text-muted-foreground">Zet de gekozen combinaties als concepten in de matrix (dimensies ingevuld; hooks/hypothese vul je daar of via de brief aan).</p>
				</div>
			</div>
		</div>
	{/if}
</div>
