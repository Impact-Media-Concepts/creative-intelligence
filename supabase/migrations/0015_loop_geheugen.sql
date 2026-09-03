-- ============================================================
-- Creative Intelligence App — 0015 Loop-geheugen (Spar Fase 2)
-- Voer uit NA 0014.
--
-- Per klant een cumulatief "loop-geheugen": besluiten, feedback en learnings die
-- de loop onthoudt en die automatisch meewegen in toekomstige generaties.
-- Wordt bijgewerkt door het team (handmatig) én automatisch (bv. bij een winnaar).
-- Additief (nullable) — verandert niets aan de bestaande flow.
-- ============================================================

alter table public.clients
	add column if not exists loop_geheugen text;
