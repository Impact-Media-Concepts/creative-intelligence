<script lang="ts">
	import { cn } from '$lib/utils';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { postJSON } from '$lib/saver.svelte';
	import { FORMATS, STRUCTUREN, CTA_SUGGESTIES } from '$lib/matrix';
	import { riceScore, afgeleidePrioriteit, type Invalshoek } from '$lib/trigger-map';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Check from '@lucide/svelte/icons/check';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';

	let { data } = $props();
	const clientId = $derived(page.params.id ?? '');
	const base = $derived(`/klanten/${clientId}`);

	type Dim = 'aanbod' | 'angle' | 'format' | 'structuur' | 'creator';

	const CREATORS_DEFAULT = ['Unisex', 'Man', 'Vrouw', 'Micro-influencer', 'Klant/UGC', 'Merk zelf', 'Geen persoon'];
	const HORIZONS = [
		{ label: '1 maand', n: 4 },
		{ label: '1 kwartaal', n: 12 },
		{ label: 'Half jaar', n: 24 }
	];

	// Per dimensie: titel, rol-badge, uitleg en kleur (accent = gekozen chip + nummer-bolletje).
	const DIMS: {
		key: Dim;
		label: string;
		kort: string;
		as: string;
		rol: string;
		uitleg: string;
		accent: string;
		rolCls: string;
	}[] = [
		{ key: 'aanbod', label: 'Aanbod', kort: 'aanbod', as: 'Aanbod', rol: 'multiplier', uitleg: 'Elke extra keuze vermenigvuldigt alles. Kies bewust.', accent: 'bg-brand-orange text-white border-brand-orange', rolCls: 'bg-[#FEF0E8] text-[#B8410C]' },
		{ key: 'angle', label: 'Invalshoek', kort: 'invalshoeken', as: 'Invalshoek', rol: 'strategisch', uitleg: 'De trigger per persona, uit je trigger map.', accent: 'bg-brand-green text-white border-brand-green', rolCls: 'bg-brand-mint text-brand-green' },
		{ key: 'format', label: 'Format', kort: 'formats', as: 'Format', rol: 'productie', uitleg: 'Hoe de creative eruitziet.', accent: 'bg-brand-action text-white border-brand-action', rolCls: 'bg-muted text-muted-foreground' },
		{ key: 'structuur', label: 'Structuur', kort: 'structuur', as: 'Structuur', rol: 'optioneel', uitleg: 'Leeg laten = niet variëren. Kies er meer om ook dit te testen.', accent: 'bg-brand-grass text-white border-brand-grass', rolCls: 'bg-muted text-muted-foreground' },
		{ key: 'creator', label: 'Creator', kort: 'creators', as: 'Creator', rol: 'productie', uitleg: 'Wie er in beeld staat.', accent: 'bg-brand-lime text-brand-green border-brand-lime', rolCls: 'bg-muted text-muted-foreground' }
	];

	// svelte-ignore state_referenced_locally
	let opts = $state<Record<Exclude<Dim, 'angle'>, string[]>>({
		aanbod: [...data.aanbodOpties],
		format: FORMATS.filter((f) => f !== 'Anders'),
		structuur: STRUCTUREN.filter((s) => s !== 'Anders'),
		creator: [...CREATORS_DEFAULT]
	});
	let extraAngles = $state<string[]>([]); // eigen invalshoeken (naast de trigger map)
	let sel = $state<Record<Dim, string[]>>({ aanbod: [], angle: [], format: [], structuur: [], creator: [] });
	let nieuw = $state<Record<Dim, string>>({ aanbod: '', angle: '', format: '', structuur: '', creator: '' });

	let cta = $state('');
	let hooks = $state(3);
	let horizon = $state(12);
	let bezig = $state(false);
	let bezigAI = $state(false);
	let fout = $state<string | null>(null);
	let resultAantal = $state<number | null>(null);

	const angles = $derived(data.invalshoeken as Invalshoek[]);
	function angleByName(naam: string): Invalshoek | undefined {
		return angles.find((a) => a.naam === naam);
	}
	function optiesVan(key: Dim): string[] {
		return key === 'angle' ? [...angles.map((a) => a.naam), ...extraAngles] : opts[key];
	}
	function toggle(key: Dim, v: string) {
		resultAantal = null;
		sel[key] = sel[key].includes(v) ? sel[key].filter((x) => x !== v) : [...sel[key], v];
	}
	function voegToe(key: Dim) {
		const v = nieuw[key].trim();
		if (!v) return;
		if (key === 'angle') {
			if (!extraAngles.includes(v) && !angles.some((a) => a.naam === v)) extraAngles.push(v);
		} else if (!opts[key].includes(v)) {
			opts[key].push(v);
		}
		if (!sel[key].includes(v)) sel[key] = [...sel[key], v];
		nieuw[key] = '';
		resultAantal = null;
	}

	const n = (k: Dim) => sel[k].length;

	// Structuur is optioneel: 0 gekozen = niet variëren (×1); 1+ = telt mee als multiplier.
	const lines = $derived(n('aanbod') * n('angle') * n('format') * Math.max(1, n('structuur')) * n('creator'));
	const hooksN = $derived(Math.max(1, Math.min(10, hooks || 1)));

	// Testassen worden afgeleid: elke dimensie waar je >1 optie kiest, test je deze ronde.
	const testAssen = $derived(DIMS.filter((d) => n(d.key) > 1));
	const primaireAs = $derived(testAssen[0]?.as ?? 'Invalshoek');

	interface Combo { aanbod: string; angle: string; format: string; structuur: string | null; creator: string; funnelfase: string; score: number; }
	const combos = $derived.by<Combo[]>(() => {
		const out: Combo[] = [];
		const structs = sel.structuur.length ? sel.structuur : [null];
		for (const a of sel.aanbod)
			for (const g of sel.angle) {
				const inv = angleByName(g);
				const sc = inv?.score ? riceScore(inv.score) : 5;
				for (const f of sel.format)
					for (const st of structs)
						for (const cr of sel.creator)
							out.push({ aanbod: a, angle: g, format: f, structuur: st, creator: cr, funnelfase: inv?.funnelfase ?? 'TOFU', score: sc });
			}
		return out.sort((x, y) => y.score - x.score);
	});
	const focus = $derived(combos.slice(0, horizon));
	const maxScore = $derived(Math.max(1, ...combos.map((c) => c.score)));

	// Meter + oordeel
	const meterMax = $derived(Math.round(horizon * 1.5));
	const meterPct = $derived(Math.min(100, (lines / meterMax) * 100));
	const niveau = $derived<'leeg' | 'strak' | 'ruim' | 'teveel'>(
		lines === 0 ? 'leeg' : lines <= horizon ? 'strak' : lines <= horizon * 1.5 ? 'ruim' : 'teveel'
	);
	const meterKleur = { leeg: 'bg-border', strak: 'bg-brand-action', ruim: 'bg-brand-lime', teveel: 'bg-brand-orange' };
	const oordeelBg = { leeg: 'bg-muted', strak: 'bg-brand-mint', ruim: 'bg-[#F4FAE8]', teveel: 'bg-[#FEF0E8]' };
	const oordeel = $derived(
		{
			leeg: 'Kies per dimensie minstens één optie.',
			strak: `Strak. ${lines} lijnen past binnen je horizon van ${horizon}.`,
			ruim: `Ruim: ${lines} lijnen tegen een streef van ${horizon}. Prima als je verder vooruit shoot.`,
			teveel: `Te veel: ${lines} lijnen tegen ${horizon}. Test minder assen tegelijk of kies de startset.`
		}[niveau]
	);

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
					structuur: c.structuur,
					cta: cta || null,
					variabele: primaireAs,
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

	// Alternatief: laat de AI een curated set voorstellen (mét hypothese/onderbouwing).
	async function aiVoorstel() {
		bezigAI = true;
		fout = null;
		resultAantal = null;
		try {
			const { concepten } = await postJSON<{ concepten: unknown[] }>(
				'/api/concepts',
				{ type: 'genereer', clientId, richtlijnen: '', config: {} },
				{ taak: 'AI-voorstel matrix' }
			);
			resultAantal = concepten.length;
		} catch (e) {
			fout = e instanceof Error ? e.message : 'AI-voorstel mislukt';
		} finally {
			bezigAI = false;
		}
	}

	const funnelCls: Record<string, string> = {
		TOFU: 'bg-[#F4FAE8] text-[#3E5A1A]',
		MOFU: 'bg-[#FEF0E8] text-[#B8410C]',
		BOFU: 'bg-brand-mint text-brand-green'
	};
	const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.14em]';
	const kaart = 'rounded-[26px] border bg-card';
	const lift = 'transition-all duration-[160ms] ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(0,87,60,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0';
</script>

<div class="space-y-5">
	{#if !data.heeftTriggerMap}
		<div class="flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
			<TriangleAlert class="size-4 shrink-0" />
			Maak eerst een <strong>trigger map</strong> — daaruit komen de invalshoeken (angles).
			<a href={`${base}/triggermap`} class="font-medium underline">Naar Trigger Map</a>
		</div>
	{:else}
		<!-- Hero: vraag + horizon + live som -->
		<section
			class="relative overflow-hidden rounded-[28px] bg-sidebar px-[30px] pb-7 pt-[26px] text-white"
			data-tour-order="1"
			data-tour-title="Testruimte"
			data-tour-text="Kies hier wat je deze ronde test: aanbod × invalshoek × format × creator. De som bovenaan rekent live mee en houdt je bij een gefocuste set — kies je bij meerdere dimensies meerdere opties, dan test je die assen tegelijk."
		>
			<!-- Decoratieve beams (merkvorm), puur sfeer -->
			<div class="pointer-events-none absolute -top-16 right-6 flex rotate-[14deg] gap-8 opacity-[0.12]" aria-hidden="true">
				{#each [0, 1, 2] as i (i)}
					<div class="flex flex-col items-center gap-2">
						<div class="size-11 rounded-full bg-sidebar-primary"></div>
						<div class="h-56 w-11 rounded-full bg-sidebar-primary"></div>
					</div>
				{/each}
			</div>

			<div class="relative flex flex-wrap items-start justify-between gap-5">
				<div class="max-w-[560px]">
					<span class={cn(eyebrow, 'text-sidebar-primary')}>Testruimte</span>
					<h2 class="mt-2 font-display text-[30px] font-bold leading-[1.15]">Wat test je deze ronde?</h2>
					<p class="mt-2 text-[15px] leading-relaxed text-sidebar-foreground">
						Kies per dimensie. De som rekent live mee, zodat je een set houdt die je echt kunt testen.
					</p>
				</div>
				<div class="flex shrink-0 flex-col gap-2">
					<span class={cn(eyebrow, 'whitespace-nowrap text-sidebar-foreground/70')}>Hoe ver vooruit?</span>
					<div class="flex gap-1 rounded-full bg-black/20 p-1">
						{#each HORIZONS as h (h.n)}
							<button
								type="button"
								class={cn(
									'whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-all',
									horizon === h.n ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-white/10'
								)}
								onclick={() => (horizon = h.n)}>{h.label}</button
							>
						{/each}
					</div>
				</div>
			</div>

			<div class="relative mt-[22px] flex flex-wrap items-center gap-2.5 rounded-[22px] bg-white/[0.07] px-[18px] py-4">
				{#each DIMS as d, i (d.key)}
					{@const c = d.key === 'structuur' ? Math.max(1, n(d.key)) : n(d.key)}
					<span class="inline-flex items-center gap-2.5">
						<span
							class={cn(
								'inline-flex items-baseline gap-[7px] rounded-full px-[15px] py-2 transition-all',
								c === 0 ? 'bg-brand-orange/90' : d.key === 'structuur' && n(d.key) === 0 ? 'bg-white/[0.08]' : 'bg-white/[0.14]'
							)}
						>
							<span class="font-display text-xl font-bold leading-none">{c}</span>
							<span class="text-[13px] font-medium">{d.kort}</span>
						</span>
						<span class="text-lg font-light text-sidebar-foreground/60">{i < DIMS.length - 1 ? '×' : '='}</span>
					</span>
				{/each}
				<span class="ml-1 inline-flex items-baseline gap-2">
					<span class="font-display text-[40px] font-bold leading-none text-sidebar-primary">{lines}</span>
					<span class="text-[15px] font-medium">lijnen</span>
				</span>
				<span class="ml-auto whitespace-nowrap text-[13px] text-sidebar-foreground">
					× {hooksN} hooks = <strong class="font-semibold text-white">{lines * hooksN} test-varianten</strong>
				</span>
			</div>
		</section>

		<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
			<!-- Linker kolom: dimensies -->
			<div class="flex flex-col gap-3.5">
				{#each DIMS as d, i (d.key)}
					{@const c = n(d.key)}
					<div class={cn(kaart, 'px-[22px] py-5 transition-shadow hover:shadow-[0_14px_30px_rgba(0,87,60,0.08)]')}>
						<div class="flex flex-wrap items-center gap-3">
							<span class={cn('flex size-[34px] shrink-0 items-center justify-center rounded-full font-display text-[15px] font-bold', d.accent)}>{i + 1}</span>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="font-display text-[19px] font-bold text-brand-green">{d.label}</h3>
									<span class={cn('rounded-full px-2.5 py-[3px] text-[11px] font-semibold', d.rolCls)}>{d.rol}</span>
								</div>
								<p class="mt-0.5 text-[13px] text-muted-foreground">{d.uitleg}</p>
							</div>
							<span
								class={cn(
									'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-3 py-[5px] text-xs font-semibold transition-all',
									c === 0 && d.key !== 'structuur'
										? 'bg-[#FEF0E8] text-[#B8410C]'
										: c > 1
											? d.accent
											: 'bg-muted text-muted-foreground'
								)}
							>
								{c === 0 ? (d.key === 'structuur' ? 'niet variëren' : 'kies er één') : `${c} gekozen`}
							</span>
						</div>

						<div class="flex flex-wrap items-center gap-2 pt-3.5">
							{#each optiesVan(d.key) as o (o)}
								{@const aan = sel[d.key].includes(o)}
								{@const inv = d.key === 'angle' ? angleByName(o) : undefined}
								<button
									type="button"
									class={cn(
										'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13.5px]',
										lift,
										aan ? cn(d.accent, 'font-semibold') : 'border-border bg-card text-foreground'
									)}
									onclick={() => toggle(d.key, o)}
								>
									{#if aan}<Check class="size-[13px]" strokeWidth={3} />{/if}
									{#if inv}
										<span class={cn('rounded-full px-[7px] py-px text-[10px] font-bold tracking-[0.04em]', aan ? 'bg-white/20 text-white' : funnelCls[inv.funnelfase])}>{inv.funnelfase}</span>
									{/if}
									{o || '(naamloos)'}
									{#if inv?.score}
										<span class={cn('text-[11px] font-semibold', aan ? 'text-sidebar-primary' : 'text-muted-foreground/70')}>{riceScore(inv.score)}</span>
									{/if}
								</button>
							{/each}
							{#if d.key === 'aanbod' && optiesVan('aanbod').length === 0}
								<span class="text-xs text-muted-foreground">Nog geen aanbod bekend — voeg toe.</span>
							{/if}
							<input
								type="text"
								bind:value={nieuw[d.key]}
								onkeydown={(e) => e.key === 'Enter' && voegToe(d.key)}
								placeholder="+ eigen…"
								class="w-[120px] rounded-full border border-dashed border-[#C6D5CC] bg-[#FAFCFB] px-3.5 py-2 text-[13px] outline-none transition-all placeholder:text-muted-foreground/70 focus:w-[180px] focus:border-solid focus:border-brand-action focus:ring-[3px] focus:ring-brand-action/25"
							/>
						</div>
					</div>
				{/each}

				<div class="grid gap-3.5 sm:grid-cols-2">
					<div class={cn(kaart, 'px-[22px] py-5')}>
						<p class={cn(eyebrow, 'text-muted-foreground')}>CTA · vast voor de hele set</p>
						<div class="flex flex-wrap gap-1.5 pt-3">
							{#each CTA_SUGGESTIES as o (o)}
								<button
									type="button"
									class={cn(
										'rounded-full border px-3 py-1.5 text-[12.5px] transition-all hover:-translate-y-px motion-reduce:hover:translate-y-0',
										cta === o ? 'border-brand-green bg-brand-green font-semibold text-white' : 'border-border bg-card'
									)}
									onclick={() => (cta = cta === o ? '' : o)}>{o}</button
								>
							{/each}
						</div>
					</div>
					<div class={cn(kaart, 'px-[22px] py-5')}>
						<p class={cn(eyebrow, 'text-muted-foreground')}>Hooks per lijn</p>
						<div class="flex items-center gap-3.5 pt-2.5">
							<button type="button" aria-label="Minder hooks" class="flex size-10 items-center justify-center rounded-full border bg-card text-brand-green transition-all hover:-translate-y-0.5 hover:border-brand-action motion-reduce:hover:translate-y-0" onclick={() => (hooks = Math.max(1, hooksN - 1))}><Minus class="size-4" /></button>
							<span class="min-w-9 text-center font-display text-[32px] font-bold leading-none text-brand-green">{hooksN}</span>
							<button type="button" aria-label="Meer hooks" class="flex size-10 items-center justify-center rounded-full border bg-card text-brand-green transition-all hover:-translate-y-0.5 hover:border-brand-action motion-reduce:hover:translate-y-0" onclick={() => (hooks = Math.min(10, hooksN + 1))}><Plus class="size-4" /></button>
							<span class="text-[12.5px] leading-snug text-muted-foreground">Goedkope sub-variant: zelfde video, andere eerste 3 seconden.</span>
						</div>
					</div>
				</div>
			</div>

			<!-- Rechter kolom: meter, startset, acties -->
			<div
				class="flex flex-col gap-3.5 lg:sticky lg:top-5"
				data-tour-order="2"
				data-tour-title="Meter, startset & acties"
				data-tour-text="Zie of je set past bij je horizon, en welke lijnen de tool op RICE als startset aanraadt. Klik 'Zet startset in de matrix' om ze als concepten in de matrix te zetten."
			>
				<div class={cn(kaart, 'p-[22px]')}>
					<div class="flex items-baseline justify-between gap-2.5">
						<p class={cn(eyebrow, 'text-muted-foreground')}>Past dit bij je horizon?</p>
						<span class="text-xs text-muted-foreground">streef {horizon}</span>
					</div>
					<div class="relative mt-4 h-3 rounded-full bg-muted">
						<div class={cn('h-3 rounded-full transition-all duration-[350ms]', meterKleur[niveau])} style="width:{meterPct}%"></div>
						<div class="absolute -top-[5px] left-[66.6%] h-[22px] w-[3px] rounded-full bg-brand-green"></div>
					</div>
					<div class="flex justify-between pt-1.5 text-[11px] text-muted-foreground/80">
						<span>0</span><span class="pl-[30%]">{horizon}</span><span>{meterMax}+</span>
					</div>
					<div class={cn('mt-3.5 flex items-start gap-2.5 rounded-[18px] px-3.5 py-3 transition-colors', oordeelBg[niveau])}>
						<span class={cn('mt-[5px] size-2 shrink-0 rounded-full', meterKleur[niveau])}></span>
						<span class="text-[13.5px] font-medium leading-snug">{oordeel}</span>
					</div>
					<div class="flex flex-wrap items-center gap-1.5 pt-3.5">
						<span class="text-[12.5px] text-muted-foreground">Je test:</span>
						{#each testAssen as d (d.key)}
							<span class={cn('rounded-full px-[11px] py-1 text-xs font-semibold', d.accent)}>{d.as}</span>
						{/each}
						{#if lines > 0 && testAssen.length === 0}
							<span class="text-[12.5px] font-medium">één vaste combinatie</span>
						{/if}
					</div>
				</div>

				<div class={cn(kaart, 'p-[22px]')}>
					<div class="flex items-center justify-between gap-2.5">
						<div>
							<p class="font-display text-lg font-bold text-brand-green">Aanbevolen startset</p>
							<p class="mt-0.5 text-[12.5px] text-muted-foreground">Kansrijkste lijnen bovenaan, op RICE</p>
						</div>
						<span class="rounded-full bg-brand-mint px-[11px] py-1 text-xs font-bold text-brand-green">{focus.length}</span>
					</div>
					<div class="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto pt-3.5">
						{#each focus as c, i (i)}
							<div class={cn('flex items-center gap-[11px] rounded-2xl px-[11px] py-[9px] transition-colors hover:bg-muted', i < 3 && 'bg-[#FAFCFB]')}>
								<span class={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', i < 3 ? 'bg-brand-green text-white' : 'bg-muted text-muted-foreground')}>{i + 1}</span>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[13px] font-semibold">{c.angle} · {c.format}{c.structuur ? ` · ${c.structuur}` : ''}</span>
									<span class="block truncate text-xs text-muted-foreground">{c.aanbod} · {c.creator}</span>
								</span>
								<span class="flex shrink-0 flex-col items-end gap-1">
									<span class="text-xs font-bold text-brand-green">{c.score}</span>
									<span class="block h-1 w-11 rounded-full bg-muted"><span class="block h-1 rounded-full bg-brand-action" style="width:{(c.score / maxScore) * 100}%"></span></span>
								</span>
							</div>
						{/each}
						{#if focus.length === 0}
							<p class="px-1 py-2.5 text-[13px] text-muted-foreground">Kies per dimensie minstens één optie, dan verschijnt hier je startset.</p>
						{/if}
					</div>
					{#if combos.length > horizon}
						<p class="mt-2.5 text-center text-xs text-muted-foreground">+{combos.length - horizon} lijnen buiten focus, bewaard voor een volgende ronde</p>
					{/if}
				</div>

				{#if fout}
					<p class="flex items-center gap-2 rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"><TriangleAlert class="size-4 shrink-0" />{fout}</p>
				{/if}
				{#if resultAantal !== null}
					<div class="flex items-center justify-between gap-3 rounded-[22px] bg-brand-lime px-4 py-3.5">
						<span class="flex items-center gap-2 text-sm font-semibold text-brand-green"><Check class="size-4" strokeWidth={2.6} />{resultAantal} concepten in de matrix</span>
						<button type="button" class="inline-flex items-center gap-1.5 rounded-full bg-brand-green px-3.5 py-2 text-[13px] font-semibold text-white" onclick={() => goto(`${base}/matrix`)}>Bekijk <ArrowRight class="size-3.5" /></button>
					</div>
				{/if}

				<button
					type="button"
					disabled={bezig || focus.length === 0}
					class={cn(
						'flex items-center justify-center gap-[9px] rounded-full px-[22px] py-[15px] text-[15px] font-semibold text-white transition-all duration-[180ms]',
						focus.length ? 'bg-brand-action hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(0,87,60,0.22)] motion-reduce:hover:translate-y-0' : 'cursor-not-allowed bg-[#B9C6BF]'
					)}
					onclick={() => genereer(false)}
				>
					{#if bezig}<LoaderCircle class="size-4 animate-spin" />{/if}
					{bezig ? 'Bezig met de matrix…' : focus.length ? `Zet startset in de matrix (${focus.length})` : 'Kies eerst je opties'}
				</button>
				{#if combos.length > horizon}
					<button type="button" disabled={bezig} class={cn('rounded-full border bg-card px-5 py-3 text-sm font-medium', lift)} onclick={() => genereer(true)}>Hele selectie ({combos.length})</button>
				{/if}

				<button
					type="button"
					disabled={bezigAI}
					class="flex items-center gap-3 rounded-[22px] border border-[#D6ECE2] bg-[#EAF5EF] px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-action motion-reduce:hover:translate-y-0"
					onclick={aiVoorstel}
				>
					{#if bezigAI}<LoaderCircle class="size-[18px] shrink-0 animate-spin text-brand-action" />{:else}<Sparkles class="size-[18px] shrink-0 fill-brand-action text-brand-action" />{/if}
					<span>
						<span class="block text-sm font-semibold text-brand-green">Liever een voorstel van Claude?</span>
						<span class="block text-[12.5px] text-muted-foreground">Een eigen set met hypothese en onderbouwing, uit je trigger map.</span>
					</span>
				</button>
			</div>
		</div>
	{/if}
</div>
