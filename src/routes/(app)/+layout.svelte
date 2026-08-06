<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { APP_NAAM, ORGANISATIE } from '$lib/config';
	import { taken } from '$lib/taken.svelte';
	import Rondleiding from '$lib/components/app/Rondleiding.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import HelpCircle from '@lucide/svelte/icons/circle-help';
	import type { ClientStatus } from '$lib/supabase/database.types';
	import Users from '@lucide/svelte/icons/users';
	import Settings from '@lucide/svelte/icons/settings';
	import Plus from '@lucide/svelte/icons/plus';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	let { data, children } = $props();

	let isAdmin = $derived(data.profiel?.rol === 'admin');
	let pad = $derived(page.url.pathname);

	// Binnen een klant → "klantomgeving": andere klanten niet tonen, wel een weg terug.
	let klantId = $derived(page.params.id);
	let huidigeKlant = $derived(
		klantId ? (data.clients.find((c) => c.id === klantId) ?? null) : null
	);
	let inKlant = $derived(!!huidigeKlant && pad.startsWith(`/klanten/${klantId}`));

	// ---- Rondleiding: auto-start voor nieuwe gebruikers (1×), altijd te heropenen ----
	let rondleidingOpen = $state(false);
	let rondleidingAutoGecheckt = false;
	$effect(() => {
		if (!rondleidingAutoGecheckt && data.profiel) {
			rondleidingAutoGecheckt = true;
			// Strikt === false: vóór migratie 0010 is de waarde undefined → geen auto-start.
			if (data.profiel.rondleiding_gezien === false) rondleidingOpen = true;
		}
	});
	async function markeerRondleidingGezien() {
		try {
			await fetch('/api/profiel', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ type: 'rondleiding_gezien', waarde: true })
			});
		} catch {
			// niet-kritisch
		}
	}
	let initialen = $derived(
		(data.profiel?.naam || data.user?.email || '?').replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase()
	);

	const statusKleur: Record<ClientStatus, string> = {
		actief: 'bg-brand-lime',
		gepauzeerd: 'bg-yellow-400',
		gearchiveerd: 'bg-sidebar-foreground/30'
	};

	function navClass(actief: boolean) {
		return cn(
			'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
			actief
				? 'bg-sidebar-accent text-sidebar-accent-foreground'
				: 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
		);
	}
</script>

<div class="flex min-h-screen">
	<aside
		class="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground"
	>
		<!-- Merk -->
		<a href="/" class="flex flex-col gap-0.5 px-5 py-5">
			<span class="text-[11px] font-semibold uppercase tracking-widest text-sidebar-primary">
				{ORGANISATIE}
			</span>
			<span class="text-lg font-bold leading-tight">{APP_NAAM}</span>
		</a>

		{#if inKlant && huidigeKlant}
			<!-- Klantomgeving: geen andere klanten zichtbaar, wel een weg terug -->
			<nav class="flex flex-col gap-1 px-3">
				<a href="/" class={navClass(false)}>
					<ArrowLeft class="size-4 shrink-0" />
					Alle klanten
				</a>
				{#if isAdmin}
					<a href="/instellingen" class={navClass(pad.startsWith('/instellingen'))}>
						<Settings class="size-4 shrink-0" />
						Instellingen
					</a>
				{/if}
			</nav>

			<div class="mt-4 flex min-h-0 flex-1 flex-col px-3">
				<span class="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
					Klantomgeving
				</span>
				<div class="flex items-center gap-2.5 rounded-md bg-sidebar-accent px-3 py-2.5">
					<span class={cn('size-2.5 shrink-0 rounded-full', statusKleur[huidigeKlant.status])}></span>
					<span class="truncate text-sm font-semibold text-sidebar-accent-foreground">
						{huidigeKlant.naam}
					</span>
				</div>
			</div>
		{:else}
			<!-- Hoofdnavigatie -->
			<nav class="flex flex-col gap-1 px-3">
				<a href="/" class={navClass(pad === '/')}>
					<Users class="size-4 shrink-0" />
					Klanten
				</a>
				{#if isAdmin}
					<a href="/instellingen" class={navClass(pad.startsWith('/instellingen'))}>
						<Settings class="size-4 shrink-0" />
						Instellingen
					</a>
				{/if}
			</nav>

			<!-- Klantenlijst -->
			<div class="mt-4 flex min-h-0 flex-1 flex-col px-3">
				<div class="flex items-center justify-between px-2 py-2">
					<span class="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
						Klanten
					</span>
					<a
						href="/klanten/nieuw"
						title="Nieuwe klant"
						class="flex size-6 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					>
						<Plus class="size-4" />
					</a>
				</div>

				<div class="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2">
					{#if data.clients.length === 0}
						<p class="px-2 py-1 text-sm text-sidebar-foreground/50">Nog geen klanten</p>
					{:else}
						{#each data.clients as klant (klant.id)}
							<a
								href={`/klanten/${klant.id}`}
								class={cn(
									'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors',
									pad.startsWith(`/klanten/${klant.id}`)
										? 'bg-sidebar-accent text-sidebar-accent-foreground'
										: 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
								)}
							>
								<span class={cn('size-2 shrink-0 rounded-full', statusKleur[klant.status])}></span>
								<span class="truncate">{klant.naam}</span>
							</a>
						{/each}
					{/if}
				</div>
			</div>
		{/if}

		<!-- Gebruiker + uitloggen -->
		<div class="border-t border-sidebar-border p-3">
			<div class="flex items-center gap-3 px-2 py-2">
				<div
					class="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground"
				>
					{initialen}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium">{data.profiel?.naam ?? data.user?.email}</p>
					<p class="text-xs capitalize text-sidebar-foreground/60">{data.profiel?.rol ?? ''}</p>
				</div>
			</div>
			<button
				type="button"
				onclick={() => (rondleidingOpen = true)}
				class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
			>
				<HelpCircle class="size-4 shrink-0" />
				Rondleiding
			</button>
			<form method="POST" action="/logout">
				<button
					class="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
				>
					<LogOut class="size-4 shrink-0" />
					Uitloggen
				</button>
			</form>
		</div>
	</aside>

	<main class="min-w-0 flex-1 bg-background">
		{@render children()}
	</main>
</div>

<Rondleiding bind:open={rondleidingOpen} onSluiten={markeerRondleidingGezien} />

<!-- App-brede indicator voor lopende achtergrondtaken (blijft staan bij navigeren) -->
{#if taken.lijst.length > 0}
	<div
		class="fixed bottom-4 right-4 z-50 flex max-w-xs items-center gap-2.5 rounded-lg border border-brand-lime/40 bg-card px-3.5 py-2.5 text-sm shadow-lg"
	>
		<LoaderCircle class="size-4 shrink-0 animate-spin text-brand-green" />
		<div class="min-w-0">
			<p class="truncate font-medium text-foreground">{taken.lijst[taken.lijst.length - 1].label}…</p>
			<p class="text-xs text-muted-foreground">
				Draait door — je kunt gerust verder werken{taken.lijst.length > 1
					? ` (${taken.lijst.length} taken)`
					: ''}
			</p>
		</div>
	</div>
{/if}
