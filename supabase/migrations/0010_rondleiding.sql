-- 0010 — Rondleiding: onthoud of een gebruiker de rondleiding al heeft gezien.
-- Voer dit uit in de Supabase SQL Editor.

alter table public.profiles
	add column if not exists rondleiding_gezien boolean not null default false;
