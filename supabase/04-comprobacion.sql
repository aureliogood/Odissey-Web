-- ============================================================================
--  COMPROBACIÓN FINAL — ejecútala DESPUÉS de los tres archivos
-- ============================================================================
--  Devuelve un informe legible. Cada línea dice qué debería estar y qué hay.
--  Si todas las líneas están en "ok", está montado bien.
--
--  Está pensada para leerse de un vistazo: si algo falla, sale en rojo y
--  con el motivo, no solo un código de error incomprensible.
-- ============================================================================


-- ---------- 1. ¿Cuántas tablas hay? ----------
-- 15, no 16: son profiles, account_identities, login_log, site_settings,
-- maintenance, site_meta, news, events, gallery, products, staff_members,
-- ratings, reports, orders y admin_log. Las del bot que no se migran
-- (mc_ops, staff_bridge...) no tienen que aparecer: si aparecen, se ha
-- creado la tabla por error y ya hay que tener cuidado con que no le
-- misma base. Es un descuido tipico al migrar.
SELECT '1. Tablas creadas' AS comprobacion,
       count(*)::text || ' (se esperan 15)' AS resultado,
       CASE WHEN count(*) = 15 THEN 'ok' ELSE 'REVISAR' END AS estado
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- Lista de tablas que sobrarian si se colaron las del bot.
SELECT '   (sobrarian si salen)' AS comprobacion,
       string_agg(table_name, ', ') AS resultado,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'REVISAR' END AS estado
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('mc_ops', 'mc_links', 'mc_link_codes',
                     'staff_claims', 'staff_bridge', 'staff_bridge_codes',
                     'accounts', 'sessions', 'users');


-- ---------- 2. ¿Todas las tablas tienen RLS? ----------
-- Esta es la importante. Una tabla sin RLS deja pasar a cualquier persona
-- del mundo y NO AVISA. Si aquí sale alguna, ese es el fallo más grave
-- posible y hay que arreglarlo antes de publicar nada.
SELECT '2. Tablas SIN RLS' AS comprobacion,
       coalesce(string_agg(c.relname, ', '), '(ninguna, perfecto)') AS resultado,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'PELIGRO' END AS estado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity;


-- ---------- 3. ¿Cuántas políticas hay? ----------
-- Rellena a balde o está mal. Debe ser mayor que cero.
SELECT '3. Políticas creadas' AS comprobacion,
       count(*)::text AS resultado,
       CASE WHEN count(*) > 0 THEN 'ok' ELSE 'FALTA EJECUTAR 02' END AS estado
FROM pg_policies
WHERE schemaname = 'public';


-- ---------- 4. ¿Los triggers están puestos? ----------
-- Si no están, al registrarse nadie tendrá fila en profiles y el usuario
-- entra pero sin nombre ni rol.
SELECT '4. Triggers' AS comprobacion,
       coalesce(string_agg(tgname, ', '), '(ninguno)') AS resultado,
       CASE WHEN count(*) = 4 THEN 'ok' ELSE 'REVISAR' END AS estado
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text LIKE '%profiles%'
  OR (NOT tgisinternal AND tgname = 'trg_crear_perfil');


-- ---------- 5. Funciones propias ----------
SELECT '5. Funciones' AS comprobacion,
       coalesce(string_agg(routine_name, ', '), '(ninguna)') AS resultado,
       CASE WHEN count(*) >= 4 THEN 'ok' ELSE 'FALTA EJECUTAR 01 o 03' END AS estado
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('ms_a_ts', 'ts_a_ms', 'es_admin', 'es_staff',
                       'rol_de', 'crear_perfil', 'proteger_rol',
                       'validar_username', 'correo_por_usuario');


-- ---------- 6. Las tablas de una sola fila ----------
-- site_settings y maintenance deben tener su fila. Sin ellas, la página
-- se queda sin la IP del servidor y sin el banner de mantenimiento.
SELECT '6. Tablas de una fila' AS comprobacion,
       (SELECT count(*) FROM public.site_settings) || ' de site_settings, ' ||
       (SELECT count(*) FROM public.maintenance) || ' de maintenance' AS resultado,
       CASE WHEN (SELECT count(*) FROM public.site_settings) = 1
             AND (SELECT count(*) FROM public.maintenance) = 1
            THEN 'ok' ELSE 'FALTA INSERT' END AS estado;


-- ---------- 7. Prueba de que el RLS corta de verdad ----------
-- Esta es la importante de verdad. Intenta leer los perfiles SIN sesión
-- (como un visitante anónimo). Debería devolver 0 filas.
-- Si devuelve filas, la tabla está abierta y hay que parar.
SET LOCAL ROLE anon;
SELECT '7.Anon puede ver perfiles' AS comprobacion,
       count(*)::text || ' filas (se esperan 0)' AS resultado,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'PELIGRO: ABIERTO' END AS estado
FROM public.profiles;
RESET ROLE;

-- Y lo contrario: con sesión de admin SÍ debe poder leer.
-- Esto se deja para cuando tengas una cuenta de admin creada.