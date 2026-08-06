<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { postJSON } from '$lib/saver.svelte';
	import { cn } from '$lib/utils';
	import type { Concept } from '$lib/supabase/database.types';
	import type { Brief } from '$lib/sprint';
	import { briefSecties, briefNaarMarkdown } from '$lib/sprint';
	import { sorteerConcepten } from '$lib/matrix';
	import FileText from '@lucide/svelte/icons/file-text';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';
	import Check from '@lucide/svelte/icons/check';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let concepten = $state<Concept[]>(data.concepten.map((c) => ({ ...c })));
	$effect(() => {
		concepten = data.concepten.map((c) => ({ ...c }));
	});

	let gesorteerd = $derived(sorteerConcepten(concepten));
	let bezig = $state<Record<string, boolean>>({});
	let fout = $state<string | null>(null);

	const funnelKleur: Record<string, string> = {
		TOFU: 'border-blue-300 bg-blue-100 text-blue-800',
		MOFU: 'border-amber-300 bg-amber-100 text-amber-800',
		BOFU: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green'
	};

	function brief(c: Concept): Brief | null {
		return (c.brief as Brief | null) ?? null;
	}

	let gekopieerd = $state<Record<string, boolean>>({});
	async function kopieer(c: Concept) {
		const b = brief(c);
		if (!b) return;
		try {
			await navigator.clipboard.writeText(briefNaarMarkdown(b, c.invalshoek || 'concept', c.format));
			gekopieerd[c.id] = true;
			setTimeout(() => (gekopieerd[c.id] = false), 2000);
		} catch {
			fout = 'Kopiëren naar klembord mislukt.';
		}
	}
	function exporteer(c: Concept) {
		const b = brief(c);
		if (!b) return;
		const md = briefNaarMarkdown(b, c.invalshoek || 'concept', c.format);
		const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const naam =
			'brief-' +
			(c.invalshoek || 'concept')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.slice(0, 40);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${naam || 'brief'}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function genBrief(c: Concept) {
		bezig[c.id] = true;
		fout = null;
		try {
			await postJSON<{ brief: Brief }>(
				'/api/sprint',
				{ type: 'brief', id: c.id },
				{ taak: 'Brief genereren', ververs: true }
			);
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Brief genereren mislukt';
		} finally {
			bezig[c.id] = false;
		}
	}
</script>

<div class="space-y-5">
	<div>
		<h2 class="text-lg font-semibold">Creative briefs</h2>
		<p class="text-sm text-muted-foreground">
			Genereer per concept een productieklare creative brief op basis van je trigger map. Dit is de
			brug tussen de matrix en de sprint.
		</p>
	</div>

	{#if fout}
		<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			<TriangleAlert class="size-4 shrink-0" />
			{fout}
		</div>
	{/if}

	{#if gesorteerd.length === 0}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<p class="text-sm font-medium text-foreground">Nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Maak eerst concepten aan in de <strong>Matrix</strong>. Daarna kun je hier per concept een
				creative brief genereren.
			</p>
		</div>
	{:else}
		{#each gesorteerd as c (c.id)}
			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							{#if c.funnelfase}
								<Badge variant="outline" class={cn('font-medium', funnelKleur[c.funnelfase])}>
									{c.funnelfase}
								</Badge>
							{/if}
							<Card.Title class="text-base">{c.invalshoek || '(geen invalshoek)'}</Card.Title>
							{#if c.format || c.structuur}
								<span class="text-xs text-muted-foreground">
									· {[c.format, c.structuur].filter(Boolean).join(' · ')}
								</span>
							{/if}
						</div>
						<div class="flex items-center gap-1.5">
							{#if brief(c)}
								<Button
									variant="ghost"
									size="sm"
									class="text-muted-foreground"
									title="Kopieer als Markdown"
									onclick={() => kopieer(c)}
								>
									{#if gekopieerd[c.id]}
										<Check class="size-4 text-brand-green" /> Gekopieerd
									{:else}
										<Copy class="size-4" /> Kopieer
									{/if}
								</Button>
								<Button
									variant="ghost"
									size="sm"
									class="text-muted-foreground"
									title="Exporteer als .md-bestand"
									onclick={() => exporteer(c)}
								>
									<Download class="size-4" /> Export
								</Button>
							{/if}
							<Button variant="outline" size="sm" onclick={() => genBrief(c)} disabled={bezig[c.id]}>
								{#if bezig[c.id]}
									<LoaderCircle class="size-4 animate-spin" />
									Genereren…
								{:else}
									<FileText class="size-4" />
									{brief(c) ? 'Brief opnieuw genereren' : 'Genereer brief'}
								{/if}
							</Button>
						</div>
					</div>
				</Card.Header>

				{#if brief(c)}
					{@const b = brief(c)!}
					<Card.Content>
						<div class="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
							{#each briefSecties(c.format) as sectie (sectie.key)}
								<div>
									<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{sectie.label}
									</p>
									<p class="mt-0.5 text-sm">{b[sectie.key]}</p>
								</div>
							{/each}
						</div>
					</Card.Content>
				{/if}
			</Card.Root>
		{/each}
	{/if}
</div>
