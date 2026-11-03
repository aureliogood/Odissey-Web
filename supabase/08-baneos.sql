-- Historial público de baneos. El plugin escribe usando una clave privada
-- guardada únicamente en la configuración del servidor Minecraft.
create table if not exists public.staff_bans (
  id text primary key,
  server_id text not null,
  player_name text not null,
  player_uuid text,
  reason text not null,
  staff_name text not null,
  created_at timestamptz not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text
);

create index if not exists staff_bans_created_at_idx on public.staff_bans (created_at desc);
alter table public.staff_bans enable row level security;
revoke all on public.staff_bans from anon, authenticated;
grant select on public.staff_bans to anon, authenticated;
grant all on public.staff_bans to service_role;
drop policy if exists "Los visitantes pueden consultar baneos" on public.staff_bans;
create policy "Los visitantes pueden consultar baneos"
  on public.staff_bans for select to anon, authenticated using (true);
-- No se crea policy pública de escritura: solo una clave de servidor privilegiada puede escribir.
