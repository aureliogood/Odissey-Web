-- ============================================================================
--  Odissey — esquema para Supabase (Postgres)
--  Ejecutar en el SQL Editor de Supabase, por partes (1 de 3).
--
--  QUÉ SE QUEDA Y QUÉ NO
--  ---------------------------------------------------------------------------
--  Se elimina (lo pediste):
--    mc_ops, mc_links, mc_link_codes       -> conexión RCON con Minecraft
--    staff_claims, staff_bridge,
--    staff_bridge_codes                     -> el puente de staff
--    sessions                               -> Supabase Auth ya trae sesiones
--    users, accounts, account_identities    -> Supabase Auth ya trae usuarios
--
--  Se migra:
--    accounts      -> auth.users (identidad) + profiles (lo demas)
--    login_log     -> login_log
--    tickets, chat_messages, global_chat_messages
--    site_meta, site_settings, maintenance
--    news, events, gallery, products, staff_members
--    ratings, reports, orders, admin_log
--
--  TIPOS
--  ---------------------------------------------------------------------------
--  La base era SQLite y guardaba las fechas como enteros (milisegundos).
--  En Postgres son timestamptz de verdad, asi que hay dos funciones abajo
--  que convierten de una a otra al importar. Los milisegundos se guardan
--  asi en el import, no al vuelo, para que el dato guardado sea el bueno.
-- ============================================================================

-- ============================================================================
--  FUNCIONES DE APOYO
-- ============================================================================

-- De epoch en milisegundos a timestamptz. NULL si no hay valor, porque en
-- SQLite muchas fechas eran opcionales y meter un 0 daría 1970.
CREATE OR REPLACE FUNCTION public.ms_a_ts(ms bigint)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN ms IS NULL OR ms = 0 THEN NULL
              ELSE to_timestamp(ms / 1000.0) END;
$$;

-- Al revés, para exportar de vuelta a SQLite si alguna vez hace falta.
CREATE OR REPLACE FUNCTION public.ts_a_ms(ts timestamptz)
RETURNS bigint
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN ts IS NULL THEN NULL
              ELSE (extract(epoch from ts) * 1000)::bigint END;
$$;

-- ¿Es este usuario admin? ¿Es staff? ¿Qué rol tiene?
--
-- OJO CON EL ORDEN: estas tres funciones van DESPUÉS de crear la tabla
-- profiles, no aquí arriba. Postgres valida el cuerpo de una función
-- LANGUAGE sql en el momento de crearla (a diferencia de plpgsql, que se
-- valida al ejecutarla), así que si la tabla no existe todavía falla con:
--
--   ERROR: relation "public.profiles" does not exist
--
-- Pasó. Está escrito abajo, justo detrás de la tabla, y con un comentario
-- para que no se vuelva a subir sin querer.


-- ============================================================================
--  1. PERFIL
--  ---------------------------------------------------------------------------
--  La identidad (correo, contraseña, confirmación) la guarda Supabase Auth en
--  auth.users. Aquí solo lo que el bot guardaba aparte y no es de Auth:
--  nombre de usuario, rol, color de acento, avatar, banner, biografía y el
--  nombre de Minecraft.
--
--  El id es el mismo UUID de auth.users. No hay "accounts" aparte: la cuenta
--  ES la de Auth y el perfil cuelga de ella.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Se guarda en minusculas para poder poner UNIQUE y que "Ana" y "ana" sean
  -- la misma persona, que es lo que hacia el bot con username_lower.
  username      text NOT NULL,
  username_lower text NOT NULL UNIQUE,
  rol           text NOT NULL DEFAULT 'user'
                  CHECK (rol IN ('user', 'staff', 'admin')),
  mc_name       text,
  avatar_url    text,
  banner_url    text,
  accent_color  text,
  bio           text,
  creado        timestamptz NOT NULL DEFAULT now(),
  visto         timestamptz NOT NULL DEFAULT now()
);

-- El nombre se busca mucho (buscador de usuarios, perfil del staff).
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username_lower);
CREATE INDEX IF NOT EXISTS idx_profiles_rol ON public.profiles (rol);


-- ============================================================================
--  FUNCIONES DE PERMISOS
--  ---------------------------------------------------------------------------
--  Estan aqui y no arriba del todo, DESPUES de la tabla profiles, a
--  proposito. Postgres valida el cuerpo de una función LANGUAGE sql al
--  crearla, no al ejecutarla, asi que si se definen antes de que exista la
--  tabla falla con:
--
--      ERROR: relation "public.profiles" does not exist
--
--  (plpgsql no tiene ese problema: se valida al ejecutarla. Por eso las
--  funciones del archivo 03 pueden ir donde quiera.)
-- ============================================================================

-- ¿Es este usuario admin? Se usa en todas las politicas de escritura de las
-- tablas de administracion.
--
-- Vive en una funcion de seguridad (security definer) porque las politicas
-- se evaluan antes de dar permiso, y una consulta a profiles dentro de otra
-- policy se traduce en recursion infinita: policy de profiles -> consulta
-- profiles -> policy de profiles -> ...
CREATE OR REPLACE FUNCTION public.es_admin(uid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT rol = 'admin' FROM public.profiles WHERE id = uid),
    false
  );
$$;

-- Mismo para staff (cubre 'staff' y 'admin').
CREATE OR REPLACE FUNCTION public.es_staff(uid uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT rol IN ('staff', 'admin') FROM public.profiles WHERE id = uid),
    false
  );
$$;

-- El rol que tiene un usuario ahora mismo. Existe por un motivo concreto:
-- la policy de UPDATE de profiles necesita comprobar que el rol no cambia,
-- y escribirlo como un SELECT dentro de la propia policy de profiles es
-- recursivo (la policy pide leer profiles para decidir sobre profiles) y
-- Postgres lo rechaza con "infinite recursion detected in policy".
--
-- Con SECURITY DEFINER la lee saltandose las policies, asi que no hay
-- recursion. Y por seguridad se fija search_path: sin eso, alguien podria
-- crear un schema suyo con una tabla "profiles" manipulada y hacer que
-- esta funcion mire ahi.
CREATE OR REPLACE FUNCTION public.rol_de(uid uuid)
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM public.profiles WHERE id = uid;
$$;

-- Discord era una identidad opcional enlazable. Sigue siendo opcional, pero
-- pasa a vivir en la columna identities de auth.users, que ya hace
-- exactamente eso. Esta tabla se queda solo si mas adelante se anade otra
-- forma de entrar (por ejemplo, un codigo de Minecraft).
CREATE TABLE IF NOT EXISTS public.account_identities (
  provider    text NOT NULL,
  provider_id text NOT NULL,
  uid         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_id)
);

-- Un registro por cada intento de entrar, salga bien o mal. Es lo que mira el
-- admin cuando dice "quien ha entrado y desde donde".
CREATE TABLE IF NOT EXISTS public.login_log (
  id         bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  uid        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username   text,
  login      text,
  ip         text,
  user_agent text,
  dispositivo text,
  correcto   boolean NOT NULL DEFAULT false,
  motivo     text,
  creado     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_log_creado ON public.login_log (creado DESC);
CREATE INDEX IF NOT EXISTS idx_login_log_uid ON public.login_log (uid);


-- ============================================================================
--  2. AJUSTES Y ESTADO DEL SITIO
--  ---------------------------------------------------------------------------
--  Las tres son de una sola fila, como en el bot (CHECK id = 1). Se mantiene
--  igual para que la forma de leerlas no cambie.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  server_ip         text,
  server_port       text,
  gamemode          text,
  discord_invite    text,
  discord_server_id text,
  version           text,
  updated_at        timestamptz DEFAULT now()
);
INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.maintenance (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  activo     boolean NOT NULL DEFAULT false,
  message    text,
  status     text NOT NULL DEFAULT 'online',
  updated_at timestamptz DEFAULT now()
);
INSERT INTO public.maintenance (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_meta (
  key   text PRIMARY KEY,
  value text
);


-- ============================================================================
--  3. CONTENIDO EDITABLE
--  ---------------------------------------------------------------------------
--  Estas cuatro son casi todas de lectura pública y escritura por staff.
--  La web las pinta sin entrar; solo quien está en el panel las cambia.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.news (
  id         text PRIMARY KEY,
  title      text,
  category   text,
  text       text,
  date       text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.events (
  id          text PRIMARY KEY,
  title       text,
  date        text,
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gallery (
  id         text PRIMARY KEY,
  image      text,
  caption    text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id         text PRIMARY KEY,
  name       text,
  price      numeric(10,2),
  category   text,
  icon       text,
  badge      text,
  image      text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff_members (
  id          text PRIMARY KEY,
  name        text,
  role        text,
  description text,
  bio         text,
  minecraft   text,
  discord     text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);


-- ============================================================================
--  4. LO QUE ESCRIBE LA GENTE
--  ============================================================================
--  ratings, reports y orders los crea cualquier visitante. El uid se saca de
--  auth.uid() en la politica: el cliente NUNCA decide de quien es una fila.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ratings (
  id         text PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  staff      text,
  stars      integer CHECK (stars BETWEEN 1 AND 5),
  comment    text,
  date       text,
  device_id  text,
  user_name  text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_created ON public.ratings (created_at DESC);
-- Una valoracion por persona y por miembro del staff.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ratings_unico
  ON public.ratings (user_id, staff) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reports (
  id         text PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target     text,
  reason     text,
  detail     text,
  capture    text,
  date       text,
  status     text NOT NULL DEFAULT 'nuevo',
  ticket_id  text,
  user_name  text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON public.reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_status  ON public.reports (status);

CREATE TABLE IF NOT EXISTS public.orders (
  id         text PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  product    text,
  usd        numeric(10,2),
  qty        integer,
  date       text,
  status     text NOT NULL DEFAULT 'pendiente',
  user_name  text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user    ON public.orders (user_id);

-- Registro de lo que hace el panel. Solo escribe el admin.
CREATE TABLE IF NOT EXISTS public.admin_log (
  id      bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  admin   text,
  action  text,
  date    text,
  creado  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
--  (sigue en 02-politicas.sql)
-- ============================================================================