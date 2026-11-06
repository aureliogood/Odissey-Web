-- Apelaciones de baneos desde la web de Odissey.
-- Ejecutar una vez en Supabase > SQL Editor.

create table if not exists public.ban_appeals (
  id text primary key,
  ban_id text not null references public.staff_bans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  message text not null check (char_length(message) between 20 and 3000),
  evidence text not null default '' check (char_length(evidence) <= 4000),
  status text not null default 'open' check (status in ('open', 'closed')),
  admin_response text not null default '' check (char_length(admin_response) <= 3000),
  admin_name text not null default '',
  ban_reason text not null default '',
  ban_staff text not null default '',
  ban_created_at timestamptz,
  ban_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ban_appeals_created_idx on public.ban_appeals (created_at desc);
create index if not exists ban_appeals_user_idx on public.ban_appeals (user_id, created_at desc);
create unique index if not exists ban_appeals_one_open_per_user_ban
  on public.ban_appeals (ban_id, user_id) where status = 'open';

alter table public.ban_appeals enable row level security;
revoke all on public.ban_appeals from anon, authenticated;
grant select, insert, update, delete on public.ban_appeals to authenticated;

drop policy if exists "Usuarios y admins leen apelaciones" on public.ban_appeals;
create policy "Usuarios y admins leen apelaciones"
  on public.ban_appeals for select to authenticated
  using (user_id = auth.uid() or public.es_admin(auth.uid()));

drop policy if exists "Cuenta vinculada puede apelar su baneo activo" on public.ban_appeals;
create policy "Cuenta vinculada puede apelar su baneo activo"
  on public.ban_appeals for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and admin_response = ''
    and admin_name = ''
    and exists (
      select 1
      from public.staff_bans b
      join public.profiles p on p.id = auth.uid()
      where b.id = ban_id
        and b.player_name = player_name
        and lower(b.player_name) = lower(p.mc_name)
        and ban_reason = b.reason
        and ban_staff = b.staff_name
        and ban_created_at is not distinct from b.created_at
        and ban_expires_at is not distinct from b.expires_at
        and b.revoked_at is null
        and (b.expires_at is null or b.expires_at > now())
    )
  );

drop policy if exists "Solo admins actualizan apelaciones" on public.ban_appeals;
create policy "Solo admins actualizan apelaciones"
  on public.ban_appeals for update to authenticated
  using (public.es_admin(auth.uid()))
  with check (public.es_admin(auth.uid()));

drop policy if exists "Solo admins eliminan apelaciones" on public.ban_appeals;
create policy "Solo admins eliminan apelaciones"
  on public.ban_appeals for delete to authenticated
  using (public.es_admin(auth.uid()));
