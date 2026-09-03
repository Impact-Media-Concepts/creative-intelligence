-- ============================================================
-- Creative Intelligence App — 0013 Matrix-dimensies (redesign Stap 1)
-- Voer uit NA 0012.
--
-- Voegt de ontbrekende testdimensies toe aan de matrix (concepts):
--   aanbod    = wat je adverteert (product/dienst) — de multiplier
--   hook      = de eerste-3-seconden-variant (goedkope sub-variant)
--   cta       = vaste call-to-action per concept
--   awareness = bewustwordingsfase van de doelgroep (5 stages of awareness)
--
-- Alles ADDITIEF (nullable) — bestaande concepten en de huidige flow blijven werken.
-- ============================================================

alter table public.concepts
	add column if not exists aanbod text,
	add column if not exists hook text,
	add column if not exists cta text,
	add column if not exists awareness text;
