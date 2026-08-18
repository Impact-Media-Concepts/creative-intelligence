-- ============================================================
-- Creative Intelligence App — 0012 Spar-modus (gesprekken bewaren)
-- Voer uit NA 0011.
--
-- Doel: per klant en per onderwerp (matrix / plan) het spar-gesprek met de
-- AI-strateeg bewaren. Vormt de basis voor het self-learning loop-geheugen:
-- besproken feedback/besluiten blijven bewaard en kunnen later doorwerken.
-- Additief; raakt niets aan de bestaande flow.
-- ============================================================

create table if not exists public.spar_berichten (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references public.clients(id) on delete cascade,
	onderwerp text not null,                 -- 'matrix' | 'plan' (uitbreidbaar)
	rol text not null check (rol in ('user', 'assistant')),
	tekst text not null,
	gebruiker_id uuid references public.profiles(id),
	created_at timestamptz not null default now()
);
create index if not exists spar_berichten_client_onderwerp_idx
	on public.spar_berichten(client_id, onderwerp, created_at);

alter table public.spar_berichten enable row level security;
drop policy if exists spar_berichten_all on public.spar_berichten;
create policy spar_berichten_all on public.spar_berichten
	for all to authenticated
	using (public.can_access_client(client_id))
	with check (public.can_access_client(client_id));
