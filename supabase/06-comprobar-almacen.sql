-- ============================================================================
--  Odissey — comprobación del almacenamiento   ·   SOLO LECTURA
--
--  ESTE FICHERO NO CREA NI MODIFICA NADA. Son consultas SELECT.
--  Puedes ejecutarlo las veces que quieras: si alguma falla, no se rompe
--  nada, porque no hay nada que deshacer.
--
--  Sirve para comprobar lo que no se puede ver desde fuera con la clave
--  publica: que el cubo existe y que sus politicas son las correctas.
--  Ahi hay que mirar con mucho cuidado: si una escritura quedara
--  abierta, cualquiera podria cambiar la foto de otro usuario.
-- ============================================================================


-- ---------------------------------------------------------------------------
--  1) ¿Existe el cubo y con los límites correctos?
--     "public" va entrecomillado porque PUBLIC es palabra reservada.
-- ---------------------------------------------------------------------------
SELECT '1. El cubo' AS que,
       CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS estado,
       coalesce(string_agg(
         id || ' | publico: ' || "public"::text ||
         ' | ' || (file_size_limit / 1048576)::text || ' MB' ||
         ' | ' || coalesce(array_length(allowed_mime_types, 1)::text, '0') || ' tipos',
         ' | '), 'no existe') AS detalle
FROM storage.buckets
WHERE id = 'perfiles';


-- ---------------------------------------------------------------------------
--  2) Las políticas, una a una.
--     Se esperan 5: una de lectura y tres de escritura, más una que ya
--     trae Supabase de serie para las migraciones.
-- ---------------------------------------------------------------------------
SELECT '2. Políticas propias' AS que,
       policyname AS nombre,
       cmd AS operacion,
       roles::text AS quien,
       -- Si trae 'auth.uid()' es que comprueba de quien es la imagen.
       CASE WHEN coalesce(qual, with_check, '') LIKE '%auth.uid()%'
            THEN 'comprueba la carpeta'
            ELSE 'sin comprobar carpeta' END AS proteccion
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'perfiles %'
ORDER BY cmd, policyname;


-- ---------------------------------------------------------------------------
--  3) Ninguna escritura puede hacerla alguien sin sesión.
--     Es la comprobación de seguridad más importante de las cinco:
--     si sale algo en la columna 'policies', se ve en la de 'quien'.
-- ---------------------------------------------------------------------------
SELECT '3. Escrituras abiertas a anon' AS que,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'PELIGRO' END AS estado,
       coalesce(string_agg(policyname || ' (' || cmd || ')', ', '), 'ninguna, correcto') AS detalle
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'perfiles %'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND (roles @> ARRAY['anon']::name[] OR roles @> ARRAY['public']::name[]);


-- ---------------------------------------------------------------------------
--  4) Las tres de escritura comprueban que la carpeta sea la del usuario.
--     Sin esto, la política 3 seguiría valiendo pero con un agujero:
--     cualquiera autenticado podría escribir dentro de la carpeta de otro.
-- ---------------------------------------------------------------------------
SELECT '4. Escrituras sin comprobar carpeta' AS que,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'PELIGRO' END AS estado,
       count(*)::text AS cuantas,
       coalesce(string_agg(policyname, ', '), 'ninguna sin comprobar') AS detalle
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'perfiles %'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND coalesce(qual, with_check, '') NOT LIKE '%auth.uid()%';


-- ---------------------------------------------------------------------------
--  5) Cuántas de las cinco hay, en total.
-- ---------------------------------------------------------------------------
SELECT '5. Recuento' AS que,
       count(*)::text || ' (se esperan 4: lectura, subir, cambiar, borrar)' AS detalle,
       CASE WHEN count(*) = 4 THEN 'ok' ELSE 'REVISAR' END AS estado
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'perfiles %';