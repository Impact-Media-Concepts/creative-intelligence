<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import IntakeProgress from '$lib/components/app/IntakeProgress.svelte';
	import { STATUSSEN, STATUS_LABELS, FASE_LABELS } from '$lib/config';
	import { datumKort, relatieveTijd } from '$lib/format';
	import { postJSON } from '$lib/saver.svelte';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Brain from '@lucide/svelte/icons/brain';

	let { data } = $props();
	let client = $derived(data.client);
	let base = $derived(`/klanten/${client.id}`);
	let andereStatussen = $derived(STATUSSEN.filter((s) => s !== client.status));

	// svelte-ignore state_referenced_locally
	let geheugen = $state(data.client.loop_geheugen ?? '');
	$effect(() => {
		geheugen = data.client.loop_geheugen ?? '';
	});
	function saveGeheugen() {
		return postJSON('/api/client', { type: 'geheugen', clientId: client.id, tekst: geheugen });
	}

	let tegels = $derived([
		{ label: 'Intake', waarde: `${data.reis.intakePct}%`, sub: 'ingevuld', href: `${base}/intake` },
		{
			label: 'Trigger map',
			waarde: data.reis.heeftTriggerMap ? `${data.reis.invalshoeken}` : '—',
			sub: data.reis.heeftTriggerMap ? 'invalshoeken' : 'nog niet gegenereerd',
			href: `${base}/triggermap`
		},
		{
			label: 'Matrix',
			waarde: `${data.reis.concepten}`,
			sub: `concepten · ${data.reis.live} live`,
			href: `${base}/matrix`
		},
		{
			label: 'Sprint',
			waarde: `${data.reis.getest}`,
			sub: `getest · ${data.reis.winnaars} winnaar${data.reis.winnaars === 1 ? '' : 's'}`,
			href: `${base}/sprint`
		},
		{ label: 'Learnings', waarde: `${data.reis.winnaars}`, sub: 'winnaars', href: `${base}/learnings` }
	]);
</script>

<!-- Volgende stap -->
<a
	href={`${base}/${data.volgendeStap.tab}`}
	class="mb-6 flex items-center justify-between gap-4 rounded-xl border border-brand-lime/40 bg-brand-mint/40 px-5 py-4 transition-colors hover:bg-brand-mint/60"
	data-tour-order="2"
	data-tour-title="Volgende stap"
	data-tour-text="Weet je even niet wat te doen? Deze kaart denkt met je mee en wijst steeds de logische vervolgstap aan — van intake tot volgende testronde."
>
	<div>
		<p class="text-xs font-medium uppercase tracking-wide text-brand-green">Volgende stap</p>
		<p class="mt-0.5 font-semibold text-foreground">{data.volgendeStap.label}</p>
		<p class="mt-0.5 text-sm text-muted-foreground">{data.volgendeStap.hint}</p>
	</div>
	<span
		class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-brand-green px-3 py-2 text-sm font-medium text-white"
	>
		Ga verder
		<ArrowRight class="size-4" />
	</span>
</a>

<!-- Reis-dashboard -->
<div
	class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
	data-tour-order="3"
	data-tour-title="Reis-dashboard"
	data-tour-text="In één oogopslag waar deze klant staat: intake-%, aantal invalshoeken, concepten, geteste sprints en winnaars. Elke tegel is klikbaar."
>
	{#each tegels as t (t.label)}
		<a
			href={t.href}
			class="rounded-lg border bg-card p-3 transition-colors hover:border-brand-lime/50 hover:bg-brand-mint/20"
		>
			<p class="text-xs text-muted-foreground">{t.label}</p>
			<p class="mt-1 text-2xl font-semibold text-foreground">{t.waarde}</p>
			<p class="text-xs text-muted-foreground">{t.sub}</p>
		</a>
	{/each}
</div>

<!-- Loop-geheugen: het cumulatieve brein per klant -->
<Card.Root class="mb-6 border-brand-lime/40 bg-brand-mint/10">
	<Card.Header>
		<Card.Title class="flex items-center gap-2 text-base">
			<Brain class="size-4 text-brand-green" />
			Loop-geheugen
		</Card.Title>
		<Card.Description>
			Wat we over deze klant hebben geleerd en besloten — dit weegt automatisch mee bij het genereren
			van nieuwe matrixen. Winnaars worden hier automatisch toegevoegd; je kunt zelf besluiten en
			inzichten aanvullen.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<Textarea
			bind:value={geheugen}
			onblur={saveGeheugen}
			rows={4}
			placeholder="Bijv. 'UGC werkt beter dan sfeer bij fan-identiteit', 'doelgroep reageert op urgentie', 'vermijd te lange intro's'…"
		/>
	</Card.Content>
</Card.Root>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
	<!-- Intake-voortgang -->
	<Card.Root class="lg:col-span-2">
		<Card.Header>
			<Card.Title>Intake-voortgang</Card.Title>
			<Card.Description>Voortgang per bron. Niet elke bron hoeft ingevuld te zijn.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-5">
			<IntakeProgress progress={data.progress} />
			<Button href={`${base}/intake`}>
				Naar de intake
				<ArrowRight class="size-4" />
			</Button>
		</Card.Content>
	</Card.Root>

	<!-- Details + acties -->
	<div class="space-y-6">
		<Card.Root>
			<Card.Header>
				<Card.Title>Gegevens</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Huidige fase</span>
					<span class="font-medium">{FASE_LABELS[client.huidige_fase]}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Status</span>
					<span class="font-medium">{STATUS_LABELS[client.status]}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Aangemaakt</span>
					<span class="font-medium">{datumKort(client.created_at)}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Laatst bijgewerkt</span>
					<span class="font-medium">{relatieveTijd(client.updated_at)}</span>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Status wijzigen</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				{#each andereStatussen as s (s)}
					<form method="POST" action="?/status" use:enhance>
						<input type="hidden" name="status" value={s} />
						<Button type="submit" variant="outline" size="sm">
							Markeer als {STATUS_LABELS[s].toLowerCase()}
						</Button>
					</form>
				{/each}
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-destructive/30">
			<Card.Header>
				<Card.Title class="text-destructive">Klant verwijderen</Card.Title>
				<Card.Description>
					Dit verwijdert de klant en alle bijbehorende intake, trigger maps en concepten. Overweeg
					in plaats daarvan archiveren.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/verwijderen"
					use:enhance={({ cancel }) => {
						if (!confirm(`Weet je zeker dat je "${client.naam}" definitief wilt verwijderen?`)) {
							cancel();
						}
					}}
				>
					<Button type="submit" variant="destructive" size="sm">Definitief verwijderen</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
