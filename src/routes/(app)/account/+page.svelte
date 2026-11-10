<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Check from '@lucide/svelte/icons/check';

	let { form, data } = $props();
	let bezig = $state(false);
</script>

<div class="mx-auto max-w-xl space-y-6 p-6">
	<div>
		<p class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Mijn account</p>
		<h1 class="font-display text-3xl font-bold text-brand-green">Wachtwoord wijzigen</h1>
		<p class="mt-1 text-sm text-muted-foreground">Ingelogd als {data.profiel?.naam ?? data.user?.email}. Kies een wachtwoord dat alleen jij kent.</p>
	</div>

	<Card.Root>
		<Card.Content class="pt-6">
			{#if form?.ok}
				<div class="mb-4 flex items-center gap-2 rounded-[14px] bg-brand-lime px-4 py-3 text-sm font-semibold text-brand-green">
					<Check class="size-4" strokeWidth={2.6} /> Je wachtwoord is gewijzigd.
				</div>
			{/if}
			{#if form?.foutmelding}
				<p class="mb-4 rounded-[14px] border border-[#F7D2BC] bg-[#FEF0E8] px-4 py-3 text-sm text-[#B8410C]">{form.foutmelding}</p>
			{/if}

			<form
				method="POST"
				action="?/wachtwoord"
				use:enhance={() => {
					bezig = true;
					return async ({ update }) => {
						await update();
						bezig = false;
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-1.5">
					<Label for="huidig">Huidig wachtwoord</Label>
					<Input id="huidig" name="huidig" type="password" autocomplete="current-password" required />
				</div>
				<div class="space-y-1.5">
					<Label for="nieuw">Nieuw wachtwoord</Label>
					<Input id="nieuw" name="nieuw" type="password" autocomplete="new-password" required minlength={10} placeholder="Minimaal 10 tekens" />
				</div>
				<div class="space-y-1.5">
					<Label for="herhaal">Nieuw wachtwoord herhalen</Label>
					<Input id="herhaal" name="herhaal" type="password" autocomplete="new-password" required minlength={10} />
				</div>
				<Button type="submit" class="w-full" disabled={bezig}>
					<KeyRound class="size-4" />
					{bezig ? 'Bezig…' : 'Wachtwoord wijzigen'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
