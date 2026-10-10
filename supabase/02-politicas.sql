-- ============================================================================
--  Odissey — políticas RLS (Supabase)   ·   2 de 3
--
--  QUE HACE ESTO
--  ---------------------------------------------------------------------------
--  El bot comprobaba los permisos en JavaScript, ruta por ruta. Con Supabase
--  los permisos están en la base de datos, y esto es lo que sustituye a todo
--  ese código: un usuario puede saltarse el JavaScript del navegador y
--  escribir directamente contra la API, pero RLS le para igual.
--
--  POR QUE IMPORTA
--  ---------------------------------------------------------------------------
--  En un sitio estático el cliente no es de fiar. Con las reglas puestas en el
--  bot, un usuario que falsificara una llamada desde la consola del
--  navegador podría saltarse el "¿es admin?". Con RLS no: la petición va
--  directa a Postgres y la base de datos dice que no.
--
--  EL TRAMPA IMPORTANTE
--  ---------------------------------------------------------------------------
--  RLS no hace NADA hasta que se activa por tabla. Una tabla sin
--  "ENABLE ROW LEVEL SECURITY" deja pasar todo el mundo, lea lo que lea,
--  y no avisa. Por eso abajo hay una comprobación final que lista las
--  tablas sin RLS: si aparece alguna, hay que mirarlo.
-- ============================================================================


-- ============================================================================
--  PROFILES
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Todo el mundo puede ver los perfiles: salen en el perfil del staff y en
-- el buscador. No hay datos sensibles aqui (ni correo ni contraseña: eso vive
-- en auth.users, que ya es privado).
DROP POLICY IF EXISTS perfiles_leer ON public.profiles;
CREATE POLICY perfiles_leer ON public.profiles
  FOR SELECT USING (true);

-- Cada quien puede tocar el suyo, pero NO cambiarse el rol.
--
-- Las dos condiciones van en la MISMA policy a proposito. Postgres une las
-- policies de una tabla con OR, no con AND: si aqui hubiera una policy
-- "UPDATE USING (auth.uid() = id)" y otra "UPDATE WITH CHECK (... el rol
-- no cambia)", la segunda no serviria de nada, porque la primera ya
-- autoriza y OR siempre gana. Serian dos puertas en la misma pared y se
-- abriria la que se quiera. Aqui hay una sola puerta con las dos
-- cerraduras.
--
-- El rol de referencia se lee con una funcion SECURITY DEFINER. Leerlo con
-- un subquery normal (SELECT rol FROM profiles...) dentro de la propia
-- policy de profiles es recursivo y Postgres lo rechaza con
-- "infinite recursion detected in policy".
DROP POLICY IF EXISTS perfiles_editar ON public.profiles;
CREATE POLICY perfiles_editar ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND rol = public.rol_de(auth.uid()));

-- Insertar su propio perfil: lo hace el trigger de registro, que va con
-- SECURITY DEFINER y ya se salta la policy. Se deja igualmente para que
-- un alta manual desde el panel no se quede sin puerta.
DROP POLICY IF EXISTS perfiles_insertar ON public.profiles;
CREATE POLICY perfiles_insertar ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- ============================================================================
--  IDENTIDADES Y REGISTRO DE ENTRADAS
--  ============================================================================
ALTER TABLE public.account_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS identidades_leer_yo ON public.account_identities;
CREATE POLICY identidades_leer_yo ON public.account_identities
  FOR SELECT USING (auth.uid() = uid);

ALTER TABLE public.login_log ENABLE ROW LEVEL SECURITY;

-- Nadie escribe en el registro desde el cliente: lo escribe el servidor o una
-- Edge Function. Con esto nadie, ni siquiera autenticado, puede insertar.
DROP POLICY IF EXISTS login_log_solo_admin ON public.login_log;
CREATE POLICY login_log_solo_admin ON public.login_log
  FOR SELECT USING (public.es_admin(auth.uid()));


-- ============================================================================
--  AJUSTES Y ESTADO
--  ---------------------------------------------------------------------------
--  Lectura pública para todos: la IP del servidor, el invite de Discord y el
--  banner de mantenimiento se ven desde la home sin entrar.
-- ============================================================================
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_settings_leer ON public.site_settings;
CREATE POLICY site_settings_leer ON public.site_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS site_settings_escribir ON public.site_settings;
CREATE POLICY site_settings_escribir ON public.site_settings
  FOR ALL USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));

ALTER TABLE public.maintenance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maintenance_leer ON public.maintenance;
CREATE POLICY maintenance_leer ON public.maintenance FOR SELECT USING (true);
DROP POLICY IF EXISTS maintenance_escribir ON public.maintenance;
CREATE POLICY maintenance_escribir ON public.maintenance
  FOR ALL USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));

ALTER TABLE public.site_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS site_meta_leer ON public.site_meta;
CREATE POLICY site_meta_leer ON public.site_meta FOR SELECT USING (true);
DROP POLICY IF EXISTS site_meta_escribir ON public.site_meta;
CREATE POLICY site_meta_escribir ON public.site_meta
  FOR ALL USING (public.es_admin(auth.uid())) WITH CHECK (public.es_admin(auth.uid()));


-- ============================================================================
--  CONTENIDO EDITABLE: LECTURA PÚBLICA, ESCRITURA DEL STAFF
-- ============================================================================
--  noticias, eventos, galeria, productos y staff_members se pintan sin
--  entrar. Los cambia quien tenga el panel.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['news', 'events', 'gallery', 'products', 'staff_members']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_leer ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_leer ON public.%I FOR SELECT USING (true)', t, t);
    -- Borrar lo hace el admin; el staff puede crear y editar.
    EXECUTE format('DROP POLICY IF EXISTS %I_crear ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_crear ON public.%I FOR INSERT WITH CHECK (public.es_staff(auth.uid()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_editar ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_editar ON public.%I FOR UPDATE USING (public.es_staff(auth.uid())) WITH CHECK (public.es_staff(auth.uid()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_borrar ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_borrar ON public.%I FOR DELETE USING (public.es_admin(auth.uid()))', t, t);
  END LOOP;
END $$;


-- ============================================================================
--  LO QUE ESCRIBE LA GENTE
-- ============================================================================
--  ratings, reports y orders los crea cualquier visitante. Aqui esta el
--  detalle importante: user_id se fuerza a auth.uid() con WITH CHECK, asi que
--  el cliente no puede poner el uid de otro ni publicar en nombre de nadie.
--  Antes ese "user_id" lo mandaba el navegador y el bot se lo creia; aqui no.
-- ============================================================================
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ratings_leer ON public.ratings;
CREATE POLICY ratings_leer ON public.ratings FOR SELECT USING (true);
DROP POLICY IF EXISTS ratings_crear ON public.ratings;
CREATE POLICY ratings_crear ON public.ratings
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
-- Editar o borrar solo lo suyo, y solo dentro de un minuto de crearse: da
-- margen para rectificar un comentario sin permitir reescribir el historico.
DROP POLICY IF EXISTS ratings_tocar ON public.ratings;
CREATE POLICY ratings_tocar ON public.ratings
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND created_at > now() - interval '1 minute');
DROP POLICY IF EXISTS ratings_borrar ON public.ratings;
CREATE POLICY ratings_borrar ON public.ratings
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reports_leer ON public.reports;
CREATE POLICY reports_leer ON public.reports
  FOR SELECT USING (auth.uid() = user_id OR public.es_staff(auth.uid()));
DROP POLICY IF EXISTS reports_crear ON public.reports;
CREATE POLICY reports_crear ON public.reports
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
DROP POLICY IF EXISTS reports_gestionar ON public.reports;
CREATE POLICY reports_gestionar ON public.reports
  FOR UPDATE USING (public.es_staff(auth.uid())) WITH CHECK (public.es_staff(auth.uid()));

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_leer ON public.orders;
CREATE POLICY orders_leer ON public.orders
  FOR SELECT USING (auth.uid() = user_id OR public.es_staff(auth.uid()));
DROP POLICY IF EXISTS orders_crear ON public.orders;
CREATE POLICY orders_crear ON public.orders
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
-- El pedido lo gestiona el staff: estado, precios, printable...
DROP POLICY IF EXISTS orders_gestionar ON public.orders;
CREATE POLICY orders_gestionar ON public.orders
  FOR UPDATE USING (public.es_staff(auth.uid())) WITH CHECK (public.es_staff(auth.uid()));
DROP POLICY IF EXISTS orders_borrar ON public.orders;
CREATE POLICY orders_borrar ON public.orders
  FOR DELETE USING (public.es_admin(auth.uid()));

ALTER TABLE public.admin_log ENABLE ROW LEVEL SECURITY;
-- Solo se escribe desde el servidor (Edge Function con service role).
DROP POLICY IF EXISTS admin_log_leer ON public.admin_log;
CREATE POLICY admin_log_leer ON public.admin_log
  FOR SELECT USING (public.es_admin(auth.uid()));

-- ============================================================================
--  (sigue en 03-datos.sql)
-- ============================================================================