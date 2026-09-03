<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import { cn } from '$lib/utils';
	import { saver, postJSON } from '$lib/saver.svelte';
	import type { Concept } from '$lib/supabase/database.types';
	import { SCRIPT_BEATS, type Script } from '$lib/productie';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LinkIcon from '@lucide/svelte/icons/link';
	import Package from '@lucide/svelte/icons/package';
	import ExternalLink from '@lucide/svelte/icons/external-link';

	let { data } = $props();

	function normScript(v: unknown): Script {
		const s = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
		return {
			hook: String(s.hook ?? ''),
			probleem: String(s.probleem ?? ''),
			oplossing: String(s.oplossing ?? ''),
			resultaat: String(s.resultaat ?? ''),
			cta: String(s.cta ?? '')
		};
	}
	type Rij = Concept & { _script: Script };

	// svelte-ignore state_referenced_locally
	let concepten = $state<Rij[]>(data.concepten.map((c) => ({ ...c, _script: normScript(c.script) })));
	$effect(() => {
		concepten = data.concepten.map((c) => ({ ...c, _script: normScript(c.script) }));
	});

	let bezig = $state<Record<string, boolean>>({});
	let fout = $state<string | null>(null);

	function saveVeld(c: Rij, veld: 'referentie' | 'props') {
		return postJSON('/api/concepts', { type: 'update', id: c.id, patch: { [veld]: c[veld] } });
	}
	function saveScript(c: Rij) {
		return postJSON('/api/concepts', { type: 'script_save', id: c.id, script: c._script });
	}
	async function genScript(c: Rij) {
		bezig[c.id] = true;
		fout = null;
		try {
			const { script } = await postJSON<{ script: Script }>(
				'/api/concepts',
				{ type: 'script_gen', id: c.id },
				{ taak: 'Script genereren' }
			);
			c._script = normScript(script);
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Script genereren mislukt';
		} finally {
			bezig[c.id] = false;
		}
	}

	const funnelKleur: Record<string, string> = {
		TOFU: 'border-blue-300 bg-blue-100 text-blue-800',
		MOFU: 'border-amber-300 bg-amber-100 text-amber-800',
		BOFU: 'border-brand-lime/50 bg-brand-lime/20 text-brand-green'
	};
	function dims(c: Rij): string {
		return [c.aanbod, c.format, c.creator_type].filter(Boolean).join(' · ');
	}
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold">Productie</h2>
			<p class="max-w-2xl text-sm text-muted-foreground">
				De brug tussen matrix en shoot: per concept een concreet 5-beats script, een referentie en
				de props — klaar om te briefen aan de designers.
			</p>
		</div>
		<div class="flex items-center gap-1.5 text-xs">
			{#if saver.fout}
				<TriangleAlert class="size-3.5 text-destructive" /><span class="text-destructive">Opslaan mislukt</span>
			{:else if saver.actief > 0}
				<LoaderCircle class="size-3.5 animate-spin text-muted-foreground" /><span class="text-muted-foreground">Opslaan…</span>
			{:else if saver.laatstOpgeslagen}
				<Check class="size-3.5 text-brand-green" /><span class="text-muted-foreground">Opgeslagen</span>
			{/if}
		</div>
	</div>

	{#if fout}
		<div class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
			<TriangleAlert class="size-4 shrink-0" />{fout}
		</div>
	{/if}

	{#if concepten.length === 0}
		<div class="rounded-lg border border-dashed bg-muted/30 p-10 text-center">
			<p class="text-sm font-medium">Nog geen concepten</p>
			<p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
				Kies eerst combinaties in de <strong>Testruimte</strong> of maak concepten in de
				<strong>Matrix</strong>. Daarna werk je ze hier uit voor de shoot.
			</p>
		</div>
	{:else}
		{#each concepten as c (c.id)}
			<Card.Root>
				<Card.Header>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div class="flex items-center gap-2">
							{#if c.funnelfase}
								<Badge variant="outline" class={cn('font-medium', funnelKleur[c.funnelfase])}>{c.funnelfase}</Badge>
							{/if}
							<Card.Title class="text-base">{c.invalshoek || '(geen invalshoek)'}</Card.Title>
							{#if dims(c)}<span class="text-xs text-muted-foreground">· {dims(c)}</span>{/if}
						</div>
						<Button variant="outline" size="sm" onclick={() => genScript(c)} disabled={bezig[c.id]}>
							{#if bezig[c.id]}<LoaderCircle class="size-4 animate-spin" /> Schrijven…{:else}<Sparkles class="size-4" /> Genereer script{/if}
						</Button>
					</div>
				</Card.Header>
				<Card.Content class="space-y-4">
					<!-- Script-beats -->
					<div class="grid gap-3 sm:grid-cols-5">
						{#each SCRIPT_BEATS as b (b.key)}
							<div class="space-y-1">
								<span class={cn('block text-xs font-semibold', b.key === 'hook' ? 'text-brand-green' : 'text-muted-foreground')}>{b.label}</span>
								<Textarea
									bind:value={c._script[b.key]}
									onblur={() => saveScript(c)}
									rows={4}
									placeholder={b.hint}
									class="text-sm"
								/>
							</div>
						{/each}
					</div>

					<!-- Referentie + props -->
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><LinkIcon class="size-3.5" /> Referentie (link)</span>
							<div class="flex items-center gap-2">
								<Input bind:value={c.referentie} onblur={() => saveVeld(c, 'referentie')} placeholder="Instagram/Pinterest-link…" class="h-9" />
								{#if c.referentie}
									<a href={c.referentie} target="_blank" rel="noopener noreferrer" class="shrink-0 text-muted-foreground hover:text-foreground" title="Openen"><ExternalLink class="size-4" /></a>
								{/if}
							</div>
						</div>
						<div class="space-y-1">
							<span class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Package class="size-3.5" /> Props</span>
							<Input bind:value={c.props} onblur={() => saveVeld(c, 'props')} placeholder="Bijv. sjaal, fiets, pet…" class="h-9" />
						</div>
					</div>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>
