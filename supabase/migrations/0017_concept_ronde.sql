-- ============================================================
-- Creative Intelligence App — 0017 Testronde per concept
-- Voer uit NA 0016.
--
-- Per concept het rondenummer van de test waar het bij hoort. De Testruimte (en "volgende
-- testronde") geeft nieuwe concepten automatisch het volgende nummer. Het Testbord toont zo
-- alleen de varianten van de huidige ronde; eerdere varianten klappen in.
-- Leeg (null) = van vóór de rondes; die blijven zichtbaar tot er een eerste ronde is.
-- Additief (nullable) — verandert niets aan de bestaande flow.
-- ============================================================

alter table public.concepts
	add column if not exists ronde integer;
