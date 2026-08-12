<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { postJSON } from '$lib/saver.svelte';
	import { syncStatusLabel } from '$lib/meta';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Unplug from '@lucide/svelte/icons/unplug';
	import Check from '@lucide/svelte/icons/check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	interface Connectie {
		ad_account_id: string;
		ad_account_naam: string | null;
		currency: string | null;
		laatste_sync_at: string | null;
		laatste_sync_status: string | null;
		laatste_sync_fout: string | null;
		token_verloopt_at: string | null;
	}

	let { clientId, connectie }: { clientId: string; connectie: Connectie | null } = $props();

	let bezigSync = $state(false);
	let bezigAccounts = $state(false);
	let fout = $state<string | null>(null);
	let melding = $state<string | null>(null);
	let accounts = $state<Array<{ id: string; naam: string; currency: string; actief: boolean }>>([]);
	let gekozenAccount = $state('');

	function datum(s: string | null): string {
		if (!s) return '–';
		return new Date(s).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });
	}

	async function syncNu() {
		bezigSync = true;
		fout = null;
		melding = null;
		try {
			const { stats } = await postJSON<{
				stats: {
					advertenties: number;
					gekoppeld: number;
					metrics_bijgewerkt: number;
					auto_winnaars: number;
				};
			}>('/api/meta', { type: 'sync_now', client: clientId }, { taak: 'Meta-sync', ververs: true });
			melding =
				`${stats.advertenties} advertenties · ${stats.gekoppeld} nieuw gekoppeld · ` +
				`${stats.metrics_bijgewerkt} concepten bijgewerkt · ${stats.auto_winnaars} automatische winnaar(s)`;
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Sync mislukt';
		} finally {
			bezigSync = false;
		}
	}

	async function toonAccounts() {
		bezigAccounts = true;
		fout = null;
		try {
			const res = await postJSON<{
				accounts: Array<{ id: string; naam: string; currency: string; actief: boolean }>;
			}>('/api/meta', { type: 'accounts', client: clientId });
			accounts = res.accounts;
			gekozenAccount = accounts.find((a) => a.actief)?.id ?? accounts[0]?.id ?? '';
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Accounts ophalen mislukt';
		} finally {
			bezigAccounts = false;
		}
	}

	async function kiesAccount() {
		if (!gekozenAccount) return;
		fout = null;
		try {
			await postJSON(
				'/api/meta',
				{ type: 'set_account', client: clientId, ad_account_id: gekozenAccount },
				{ ververs: true }
			);
			accounts = [];
			melding = 'Advertentieaccount gewijzigd. Klik op "Sync nu" om de nieuwe cijfers op te halen.';
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Account wijzigen mislukt';
		}
	}

	async function verbreek() {
		if (!confirm('Meta-koppeling verbreken? Automatisch uitlezen stopt dan.')) return;
		fout = null;
		try {
			await postJSON('/api/meta', { type: 'disconnect', client: clientId }, { ververs: true });
		} catch (e) {
			fout = e instanceof Error ? e.message : 'Verbreken mislukt';
		}
	}
</script>

<Card.Root
	data-tour-order="2"
	data-tour-title="Meta-koppeling — automatisch uitlezen"
	data-tour-text="Koppel het Meta-advertentieaccount van deze klant. De resultaten (hook rate, CTR, ROAS, CPA) worden dan elke nacht automatisch per concept ingevuld en duidelijke winnaars markeert de tool zelf."
>
	<Card.Header>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="flex items-center gap-2 text-base">
				<Link2 class="size-4 text-brand-green" />
				Meta-koppeling
			</Card.Title>
			{#if connectie}
				<span class="inline-flex items-center gap-1.5 text-xs">
					{#if connectie.laatste_sync_status === 'success'}
						<Check class="size-3.5 text-brand-green" />
					{:else if connectie.laatste_sync_status === 'error'}
						<TriangleAlert class="size-3.5 text-destructive" />
					{/if}
					<span class="text-muted-foreground">{syncStatusLabel(connectie.laatste_sync_status)}</span>
				</span>
			{/if}
		</div>
	</Card.Header>

	<Card.Content class="space-y-3">
		{#if !connectie}
			<p class="text-sm text-muted-foreground">
				Nog geen advertentieaccount gekoppeld. Koppel Meta om resultaten automatisch uit te lezen
				en te verwerken.
			</p>
			<Button href={`/api/meta/connect?client=${clientId}`} data-sveltekit-reload>
				<Link2 class="size-4" />
				Koppel Meta-advertentieaccount
			</Button>
		{:else}
			<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
				<span>
					<span class="text-muted-foreground">Account:</span>
					<span class="font-medium">{connectie.ad_account_naam || connectie.ad_account_id}</span>
					{#if connectie.currency}<span class="text-muted-foreground"> ({connectie.currency})</span
						>{/if}
				</span>
				<span class="text-muted-foreground">Laatste sync: {datum(connectie.laatste_sync_at)}</span>
			</div>

			{#if connectie.laatste_sync_status === 'error' && connectie.laatste_sync_fout}
				<p class="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
					{connectie.laatste_sync_fout}
				</p>
			{/if}

			<div class="flex flex-wrap gap-2">
				<Button size="sm" onclick={syncNu} disabled={bezigSync}>
					{#if bezigSync}
						<LoaderCircle class="size-4 animate-spin" />
						Synchroniseren…
					{:else}
						<RefreshCw class="size-4" />
						Sync nu
					{/if}
				</Button>
				<Button variant="outline" size="sm" onclick={toonAccounts} disabled={bezigAccounts}>
					{#if bezigAccounts}<LoaderCircle class="size-4 animate-spin" />{/if}
					Ander account
				</Button>
				<Button variant="ghost" size="sm" onclick={verbreek}>
					<Unplug class="size-4" />
					Verbreek
				</Button>
			</div>

			{#if accounts.length}
				<div class="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
					<select
						bind:value={gekozenAccount}
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
					>
						{#each accounts as a (a.id)}
							<option value={a.id}>{a.naam} ({a.currency}) — {a.id}</option>
						{/each}
					</select>
					<Button size="sm" onclick={kiesAccount}>Opslaan</Button>
				</div>
			{/if}
		{/if}

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
	</Card.Content>
</Card.Root>
