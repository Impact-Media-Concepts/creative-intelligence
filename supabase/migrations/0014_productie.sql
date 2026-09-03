-- ============================================================
-- Creative Intelligence App — 0014 Productie-/shootlaag (redesign Stap 3)
-- Voer uit NA 0013.
--
-- De brug tussen matrix (wat testen we) en shoot (hoe maken we het):
--   script     = 5-beats script (Hook -> Probleem -> Oplossing -> Resultaat -> CTA)
--   referentie = inspiratie-/referentielink (Instagram/Pinterest/…)
--   props      = benodigde props/rekwisieten voor de shoot
--
-- Additief (nullable) — bestaande flow blijft werken.
-- ============================================================

alter table public.concepts
	add column if not exists script jsonb,
	add column if not exists referentie text,
	add column if not exists props text;
