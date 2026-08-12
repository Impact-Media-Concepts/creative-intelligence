-- ============================================================
-- Creative Intelligence App — 0011 Meta-koppeling (Sprint-automatisering)
-- Voer uit NA 0010.
--
-- Doel: Meta Ads automatisch uitlezen en de resultaten per concept verwerken.
--   - meta_connections : 1 gekoppeld Meta-advertentieaccount per klant (met token)
--   - meta_ads         : catalogus van advertenties uit het account (voor koppelen + auto-match)
--   - concepts.*       : koppeling naar een Meta-ad + auto-sync/auto-winnaar velden
--
-- Alles is ADDITIEF: zonder koppeling verandert er niets aan de bestaande flow.
-- ============================================================

-- ------------------------------------------------------------
-- meta_connections — gekoppeld advertentieaccount per klant
-- Let op: access_token staat hier als tekst. De database is privé (niet publiek);
-- alleen de eigenaar (via RLS) en de service-role kunnen de rij lezen.
-- ------------------------------------------------------------
create table if not exists public.meta_connections (
	id uuid primary key default gen_random_uuid(),
	client_id uuid not null references public.clients(id) on delete cascade,
	ad_account_id text not null,               -- act_xxxx: het gekozen advertentieaccount
	ad_account_naam text,
	currency text,
	timezone_name text,
	business_id text,
	access_token text,                          -- long-lived Meta user token
	token_verloopt_at timestamptz,
	gekoppeld_door uuid references public.profiles(id),
	gekoppeld_at timestamptz not null default now(),
	losgekoppeld_at timestamptz,                -- gevuld = koppeling verbroken (sync slaat over)
	laatste_sync_at timestamptz,
	laatste_sync_status text,                   -- 'success' | 'error'
	laatste_sync_fout text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (client_id)                          -- 1 actieve koppeling per klant
);
create index if not exists meta_connections_client_idx on public.meta_connections(client_id);
create or replace trigger meta_connections_set_updated_at
	before update on public.meta_connections
	for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- meta_ads — catalogus van advertenties uit het gekoppelde account
-- Idempotent bijgewerkt per sync (upsert op connection_id + external_id).
-- laatste_metrics: geaggregeerde ruwe cijfers over het sync-venster (voor koppel-UI + guardrail).
-- ------------------------------------------------------------
create table if not exists public.meta_ads (
	id uuid primary key default gen_random_uuid(),
	connection_id uuid not null references public.meta_connections(id) on delete cascade,
	client_id uuid not null references public.clients(id) on delete cascade,
	external_id text not null,                  -- Meta ad id
	naam text,
	adset_id text,
	campaign_id text,
	status text,                                -- effective_status
	preview_url text,
	eerste_gezien_at timestamptz,
	laatste_metrics jsonb,                      -- { impressions, spend_cents, ... , dagen_actief }
	laatste_sync_at timestamptz,
	created_at timestamptz not null default now(),
	unique (connection_id, external_id)
);
create index if not exists meta_ads_connection_idx on public.meta_ads(connection_id);
create index if not exists meta_ads_client_idx on public.meta_ads(client_id);

-- ------------------------------------------------------------
-- concepts — koppeling met een Meta-ad + automatisering
-- ------------------------------------------------------------
alter table public.concepts
	add column if not exists meta_ad_external_id text,      -- gekoppelde Meta ad id (of NULL)
	add column if not exists meta_auto_sync boolean not null default true,  -- automatisch metrics overnemen
	add column if not exists meta_metrics jsonb,            -- ruwe geaggregeerde cijfers van de laatste sync
	add column if not exists meta_laatste_sync timestamptz,
	add column if not exists auto_winnaar boolean not null default false;    -- winnaar automatisch gemarkeerd door de guardrail

create index if not exists concepts_meta_ad_idx on public.concepts(client_id, meta_ad_external_id);

-- ------------------------------------------------------------
-- RLS — zelfde model als de rest: toegang via can_access_client()
-- ------------------------------------------------------------
alter table public.meta_connections enable row level security;
drop policy if exists meta_connections_all on public.meta_connections;
create policy meta_connections_all on public.meta_connections
	for all to authenticated
	using (public.can_access_client(client_id))
	with check (public.can_access_client(client_id));

alter table public.meta_ads enable row level security;
drop policy if exists meta_ads_all on public.meta_ads;
create policy meta_ads_all on public.meta_ads
	for all to authenticated
	using (public.can_access_client(client_id))
	with check (public.can_access_client(client_id));
