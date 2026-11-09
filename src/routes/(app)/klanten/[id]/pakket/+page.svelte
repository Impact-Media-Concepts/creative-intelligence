<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { BEWUSTZIJN_KLEUR } from '$lib/trigger-map';
	import { briefSecties } from '$lib/sprint';
	import { SCRIPT_BEATS, ADVERTENTIE_VELDEN } from '$lib/productie';
	import {
		groepeerPerFase,
		pakketNaarMarkdown,
		leesBrief,
		leesScript,
		dimsTekst,
		type PakketConcept
	} from '$lib/pakket';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Printer from '@lucide/svelte/icons/printer';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';

	let { data } = $props();
	const base = $derived(`/klanten/${page.params.id}`);
	const klantNaam = $derived(data.client.naam);

	const concepten = $derived(data.concepten as unknown as PakketConcept[]);
	const groepen = $derived(groepeerPerFase(concepten));
	const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

	// Hoe ver is het pakket al uitgewerkt? (alleen op het scherm, niet in de print)
	const metBrief = $derived(concepten.filter((c) => leesBrief(c)).length);
	const metScript = $derived(concepten.filter((c) => leesScript(c)?.hook).length);
	const metAd = $derived(concepten.filter((c) => leesScript(c)?.advertentie?.primair).length);

	const markdown = $derived(pakketNaarMarkdown(klantNaam, concepten, datum));
	let gekopieerd = $state(false);
	async function kopieer() {
		try {
			await navigator.clipboard.writeText(markdown);
			gekopieerd = true;
			setTimeout(() => (gekopieerd = false), 2000);
		} catch {
			// klembord niet beschikbaar
		}
	}
	function download() {
		const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `briefing-pakket-${klantNaam.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const knop =
		'inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-[13px] font-medium transition-all hover:-translate-y-0.5 hover:bg-muted motion-reduce:hover:translate-y-0';
</script>

<div class="space-y-5">
	<!-- Werkbalk (niet in de print) -->
	<div class="flex flex-wrap items-center justify-between gap-3 print:hidden">
		<a href="{base}/productie" class={knop}><ArrowLeft class="size-4" /> Terug naar Creatie</a>
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class={knop} onclick={kopieer}>
				{#if gekopieerd}<Check class="size-4 text-brand-action" /> Gekopieerd{:else}<Copy class="size-4" /> Kopieer als tekst{/if}
			</button>
			<button type="button" class={knop} onclick={download}><Download class="size-4" /> Download (.md)</button>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-full bg-brand-green px-5 py-2 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#00432E] motion-reduce:hover:translate-y-0"
				onclick={() => window.print()}
			>
				<Printer class="size-4" /> Printen / opslaan als PDF
			</button>
		</div>
	</div>

	{#if concepten.length === 0}
		<div class="rounded-[28px] border border-dashed bg-card p-10 text-center">
			<p class="font-display text-lg font-bold text-brand-green">Nog geen concepten</p>
			<p class="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
				Zodra er concepten in de matrix staan, verschijnt hier je briefing-pakket.
			</p>
		</div>
	{:else}
		<!-- Voortgang (niet in de print) -->
		<div class="rounded-2xl bg-[#EAF5EF] px-4 py-3 text-[13px] text-brand-green print:hidden">
			<strong>{concepten.length} concepten</strong> · {metBrief} met brief · {metScript} met script · {metAd} met advertentietekst.
			{#if metBrief < concepten.length || metScript < concepten.length || metAd < concepten.length}
				<a href="{base}/productie" class="font-semibold underline">Werk de rest uit in Creatie</a>, het pakket vult zich vanzelf.
			{/if}
		</div>

		<!-- Het document -->
		<article class="rounded-[28px] border bg-white p-8 print:rounded-none print:border-0 print:p-0">
			<header class="border-b pb-5">
				<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-action">Online Klik · Creative Intelligence</p>
				<h2 class="mt-1 font-display text-3xl font-bold text-brand-green">Briefing-pakket — {klantNaam}</h2>
				<p class="mt-1 text-sm text-muted-foreground">Samengesteld op {datum} · {concepten.length} concepten, gegroepeerd per bewustzijnsfase</p>
			</header>

			{#each groepen as groep (groep.fase)}
				<section class="mt-8">
					<div class="flex flex-wrap items-baseline gap-3 border-b pb-2">
						<h3 class="font-display text-xl font-bold text-brand-green">{groep.fase}</h3>
						<span class={cn('rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', BEWUSTZIJN_KLEUR[groep.fase])}>Taak: {groep.taak}</span>
					</div>

					{#each groep.concepten as c, i (c.id)}
						{@const brief = leesBrief(c)}
						{@const script = leesScript(c)}
						<div class="mt-5 break-inside-avoid rounded-[20px] border p-5 print:rounded-lg">
							<div class="flex flex-wrap items-baseline justify-between gap-2">
								<h4 class="font-display text-lg font-bold">{i + 1}. {c.invalshoek || '(geen invalshoek)'}</h4>
								{#if c.prioriteit}<span class="text-xs font-semibold text-muted-foreground">Prioriteit: {c.prioriteit}</span>{/if}
							</div>
							{#if dimsTekst(c)}<p class="mt-0.5 text-[13px] text-muted-foreground">{dimsTekst(c)}</p>{/if}
							{#if c.hypothese}<p class="mt-2 text-sm"><span class="font-semibold">Hypothese:</span> {c.hypothese}</p>{/if}

							{#if brief}
								<div class="mt-4">
									<p class="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Brief</p>
									<dl class="mt-1.5 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
										{#each briefSecties(c.format) as sec (sec.key)}
											{#if brief[sec.key]}
												<div>
													<dt class="text-xs font-semibold text-muted-foreground">{sec.label}</dt>
													<dd>{brief[sec.key]}</dd>
												</div>
											{/if}
										{/each}
									</dl>
								</div>
							{/if}

							{#if script && SCRIPT_BEATS.some((b) => script[b.key])}
								<div class="mt-4">
									<p class="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Script</p>
									<ol class="mt-1.5 space-y-1 text-sm">
										{#each SCRIPT_BEATS as b (b.key)}
											{#if script[b.key]}<li><span class="font-semibold">{b.label}:</span> {script[b.key]}</li>{/if}
										{/each}
									</ol>
								</div>
							{/if}

							{#if script?.advertentie && ADVERTENTIE_VELDEN.some((v) => script.advertentie?.[v.key])}
								<div class="mt-4 rounded-2xl bg-[#F1F6F2] p-4 print:border print:bg-white">
									<p class="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Advertentietekst</p>
									{#if script.advertentie.primair}<p class="mt-1.5 whitespace-pre-line text-sm">{script.advertentie.primair}</p>{/if}
									{#if script.advertentie.kop}<p class="mt-2 text-sm font-bold">{script.advertentie.kop}</p>{/if}
									{#if script.advertentie.omschrijving}<p class="text-[13px] text-muted-foreground">{script.advertentie.omschrijving}</p>{/if}
								</div>
							{/if}

							{#if c.referentie || c.props}
								<p class="mt-3 text-[13px] text-muted-foreground">
									{#if c.referentie}<span class="font-semibold">Referentie:</span> {c.referentie}{/if}
									{#if c.referentie && c.props} · {/if}
									{#if c.props}<span class="font-semibold">Props:</span> {c.props}{/if}
								</p>
							{/if}

							{#if !brief && !script}
								<p class="mt-3 text-[12.5px] text-muted-foreground print:hidden">Nog niet uitgewerkt (geen brief of script).</p>
							{/if}
						</div>
					{/each}
				</section>
			{/each}
		</article>
	{/if}
</div>
