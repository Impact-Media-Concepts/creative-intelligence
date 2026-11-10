-- ============================================================
-- Creative Intelligence App — 0018 Bureau-instellingen (o.a. Meta Ad Library-token)
-- Voer uit NA 0017.
--
-- Een kleine sleutel/waarde-tabel voor instellingen die voor het hele bureau gelden en die niet
-- in een .env passen omdat ze verlopen of door een admin worden ververst. Eerste gebruik:
-- het Meta-gebruikerstoken waarmee de Ad Library-scan werkt (Meta geeft de Ad Library alleen vrij
-- aan een persoon met bevestigde identiteit, niet aan het app-token).
--
-- Beveiliging: Row Level Security staat AAN en er is bewust GEEN policy. Zo kan niemand via de
-- browser bij deze tabel; alleen de server (service role) leest en schrijft hem.
-- ============================================================

create table if not exists public.bureau_instellingen (
	sleutel text primary key,
	waarde text,
	verloopt_at timestamptz,
	bijgewerkt_door uuid references public.profiles(id),
	bijgewerkt_at timestamptz not null default now()
);

alter table public.bureau_instellingen enable row level security;
