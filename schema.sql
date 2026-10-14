-- Eseguire nel SQL Editor del progetto Supabase.
create table if not exists public.dashboard_snapshots (
  id integer primary key check (id = 1),
  payload jsonb not null,
  synced_at timestamptz not null default now()
);
alter table public.dashboard_snapshots enable row level security;
-- Solo utenti autenticati possono leggere la dashboard.
create policy "Authenticated users can read dashboard snapshot"
  on public.dashboard_snapshots for select to authenticated using (true);
-- Nessuna policy client per insert/update: solo il modulo locale usa la service role key.
