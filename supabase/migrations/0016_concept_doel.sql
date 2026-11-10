-- ============================================================
-- Creative Intelligence App — 0016 Doel per concept (Testbord)
-- Voer uit NA 0015.
--
-- Per concept het campagnedoel waarvoor het getest wordt: Aankoop (bv. Advantage+ Shopping),
-- Leads, Traffic, Awareness, … Zo kunnen meerdere campagnes/doelen naast elkaar draaien en
-- toont het Testbord per doel een eigen blok met eigen testrondes.
-- Leeg (null) betekent "Aankoop", dus bestaande concepten veranderen niet.
-- Additief (nullable) — verandert niets aan de bestaande flow.
-- ============================================================

alter table public.concepts
	add column if not exists doel text;
