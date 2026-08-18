<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { cn } from '$lib/utils';
	import MessagesSquare from '@lucide/svelte/icons/messages-square';
	import Send from '@lucide/svelte/icons/send';
	import Check from '@lucide/svelte/icons/check';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	interface Beurt {
		rol: 'user' | 'assistant';
		tekst: string;
	}

	let {
		clientId,
		onderwerp,
		startBerichten = [],
		context,
		onToepassen,
		titel = 'Spar met de strateeg',
		intro = 'Bespreek de opzet met de AI-strateeg — stel vragen, doe suggesties. Er verandert niets tot je op "Voer besproken wijzigingen door" klikt.'
	}: {
		clientId: string;
		onderwerp: 'matrix' | 'plan';
		startBerichten?: Array<{ rol: 'user' | 'assistant'; tekst: string }>;
		context?: () => string;
		onToepassen: (sturing: string) => void | Promise<void>;
		titel?: string;
		intro?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	let berichten = $state<Beurt[]>(startBerichten.map((b) => ({ rol: b.rol, tekst: b.tekst })));
	let invoer = $state('');
	let open = $state(false);
	let bezig = $state(false);
	let bezigToepassen = $state(false);
	let fout = $state<string | null>(null);
	let melding = $state<string | null>(null);

	async function post<T>(body: Record<string, unknown>): Promise<T> {
		const res = await fetch('/api/spar', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ clientId, onderwerp, ...body })
		});
		if (!res.ok) {
			const j = await res.json().catch(() => ({}));
			throw new Error(j.message || `Fout (${res.status})`);
		}
		return res.json() as Promise<T>;
	}

	async function verstuur() {
		const tekst = invoer.trim();
		if (!tekst || bezig) return;
		fout = null;
		melding = null;
		berichten.push({ rol: 'user', tekst });
		invoer = '';
		bezig = true;
		try {
			const { antwoord } = await post<{ antwoord: string }>({
				type: 'bericht',
				tekst,
				context: context?.() ?? ''
			});
			berichten.push({ rol: 'assistant', tekst: antwoord });
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Versturen mislukt';
			berichten.push({
				rol: 'assistant',
				tekst: '⚠️ Er ging iets mis. Probeer het nog eens.'
			});
		} finally {
			bezig = false;
		}
	}

	async function toepassen() {
		if (bezigToepassen || !berichten.length) return;
		fout = null;
		melding = null;
		bezigToepassen = true;
		try {
			const { sturing } = await post<{ sturing: string }>({ type: 'samenvatting' });
			if (!sturing || sturing.toUpperCase().includes('GEEN')) {
				melding = 'Er zijn nog geen concrete wijzigingen afgesproken om door te voeren.';
				return;
			}
			await onToepassen(sturing);
			melding = 'Besproken wijzigingen worden doorgevoerd.';
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Doorvoeren mislukt';
		} finally {
			bezigToepassen = false;
		}
	}

	async function wis() {
		if (!confirm('Het hele spar-gesprek wissen?')) return;
		try {
			await post({ type: 'wis' });
			berichten = [];
			melding = null;
			fout = null;
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Wissen mislukt';
		}
	}

	function opToets(e: KeyboardEvent) {
		// Enter verstuurt; Shift+Enter maakt een nieuwe regel.
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			verstuur();
		}
	}
</script>

<div class="rounded-lg border border-brand-lime/40 bg-brand-mint/10">
	<button
		type="button"
		class="flex w-full items-center gap-2 p-4 text-left"
		onclick={() => (open = !open)}
	>
		<MessagesSquare class="size-4 shrink-0 text-brand-green" />
		<span class="text-base font-semibold">{titel}</span>
		{#if berichten.length}
			<span class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
				{berichten.length}
			</span>
		{/if}
		<span class="hidden text-sm text-muted-foreground sm:inline">— eerst overleggen, dan pas doorvoeren</span>
		<ChevronDown
			class={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
		/>
	</button>

	{#if open}
		<div class="space-y-3 border-t p-4">
			<p class="text-sm text-muted-foreground">{intro}</p>

			<!-- Gesprek -->
			{#if berichten.length}
				<div class="max-h-96 space-y-2 overflow-y-auto rounded-md border bg-background p-3">
					{#each berichten as b, i (i)}
						<div class={cn('flex', b.rol === 'user' ? 'justify-end' : 'justify-start')}>
							<div
								class={cn(
									'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
									b.rol === 'user'
										? 'bg-brand-green text-white'
										: 'border bg-muted/40 text-foreground'
								)}
							>
								{b.tekst}
							</div>
						</div>
					{/each}
					{#if bezig}
						<div class="flex justify-start">
							<div class="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
								<LoaderCircle class="size-4 animate-spin" />
								De strateeg denkt mee…
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Invoer -->
			<div class="space-y-2">
				<Textarea
					bind:value={invoer}
					onkeydown={opToets}
					rows={2}
					placeholder={'Bijv. "Klopt het dat creator type klant/UGC is? We hebben alleen static." of "Hoe zit het met alle persona\'s in één TOFU-test?"'}
				/>
				<div class="flex flex-wrap items-center gap-2">
					<Button size="sm" onclick={verstuur} disabled={bezig || !invoer.trim()}>
						{#if bezig}
							<LoaderCircle class="size-4 animate-spin" />
						{:else}
							<Send class="size-4" />
						{/if}
						Verstuur
					</Button>
					<Button
						variant="default"
						size="sm"
						class="bg-brand-green hover:bg-brand-green/90"
						onclick={toepassen}
						disabled={bezigToepassen || bezig || !berichten.length}
					>
						{#if bezigToepassen}
							<LoaderCircle class="size-4 animate-spin" /> Doorvoeren…
						{:else}
							<Check class="size-4" /> Voer besproken wijzigingen door
						{/if}
					</Button>
					{#if berichten.length}
						<Button variant="ghost" size="sm" class="text-muted-foreground" onclick={wis}>
							<Trash2 class="size-4" /> Wis gesprek
						</Button>
					{/if}
				</div>
			</div>

			{#if melding}
				<p class="flex items-center gap-2 rounded-md border border-brand-lime/40 bg-brand-mint/50 px-3 py-2 text-sm text-brand-green">
					<Check class="size-4 shrink-0" />
					{melding}
				</p>
			{/if}
			{#if fout}
				<p class="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					<TriangleAlert class="size-4 shrink-0" />
					{fout}
				</p>
			{/if}
		</div>
	{/if}
</div>
