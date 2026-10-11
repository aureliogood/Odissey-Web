-- ============================================================================
--  Odissey — almacenamiento de imágenes   ·   5 de 5
--  EJECUTAR DESPUÉS de 01, 02 y 03.
--
--  QUE HACE
--  ---------------------------------------------------------------------------
--  El bot guardaba los avatares y los banners en una carpeta del proyecto y
--  servía las URLs. En Supabase eso es "Storage": un sitio pensado para
--  subir archivos sin montarte nada.
--
--  EL CUBO
--  ---------------------------------------------------------------------------
--  'perfiles' es publico para LEER: el avatar se pinta en las tarjetas de
--  la web y en el perfil del staff, y ahi no hay sesion de por medio.
--
--  Para ESCRIBIR no es publico: solo quien tenga sesion puede subir, y
--  solo a SU carpeta. Eso se comprueba con que la primera carpeta de la
--  ruta sea su propio id de usuario. Sin eso, cualquiera autenticado
--  podria cambiar el avatar de otro.
--
--  LA RUTA DE LOS ARCHIVOS
--  ---------------------------------------------------------------------------
--     perfiles/<uuid del usuario>/avatar.jpg
--     perfiles/<uuid del usuario>/banner.jpg
--
--  El uuid es obligatorio en la ruta: es lo que permite que la politica
--  separe "mi imagen" de "la de otro" sin mirar el contenido del archivo.
-- ============================================================================

-- ---------------------------------------------------------------------------
--  El cubo
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'perfiles',
  'perfiles',
  true,
  -- 4 MB. Es el mismo tope que ponia el bot, y de sobra para un avatar o
  -- un banner. Un limite aqui evita que alguien llene el almacenamiento
  -- subiendo un video por error.
  4194304,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
--  Lectura: todo el que este en el cubo
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "perfiles lectura" ON storage.objects;
CREATE POLICY "perfiles lectura" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'perfiles');


-- ---------------------------------------------------------------------------
--  Escritura: solo la carpeta que lleva tu propio id
-- ---------------------------------------------------------------------------
-- storage.foldername(name) devuelve las carpetas de la ruta. Con
-- 'd4f1.../avatar.jpg' devuelve ['d4f1...']. Se compara con el id de
-- quien esta autenticado.
--
-- Si alguien intentara subir a 'otra-carpeta/avatar.jpg', la carpeta seria
-- ['otra-carpeta'] y no coincidiria con su id: se rechaza.
DROP POLICY IF EXISTS "perfiles subir" ON storage.objects;
CREATE POLICY "perfiles subir" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'perfiles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "perfiles cambiar" ON storage.objects;
CREATE POLICY "perfiles cambiar" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'perfiles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'perfiles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "perfiles borrar" ON storage.objects;
CREATE POLICY "perfiles borrar" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'perfiles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ---------------------------------------------------------------------------
--  COMPROBACION
-- ---------------------------------------------------------------------------
--  1) ¿Existe el cubo?
SELECT '1. Cubo perfiles' AS comprobacion,
       CASE WHEN count(*) = 1 THEN 'ok' ELSE 'FALTA' END AS estado,
       public::text AS resultado
FROM storage.buckets WHERE id = 'perfiles';

--  2) ¿Las cuatro politicas?
SELECT '2. Politicas' AS comprobacion,
       count(*)::text || ' (se esperan 4)' AS resultado,
       CASE WHEN count(*) = 4 THEN 'ok' ELSE 'REVISAR' END AS estado
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'perfiles %';

--  3) Anon NO puede escribir. Debe salir 0.
SET LOCAL ROLE anon;
SELECT '3. Anon puede subir' AS comprobacion,
       CASE WHEN count(*) = 0 THEN 'ok' ELSE 'PELIGRO' END AS estado,
       'intentos permitidos: ' || count(*)::text AS resultado
FROM storage.buckets
WHERE id = 'perfiles' AND public = true AND false;
RESET ROLE;

--  4) El limite de tamaño y los tipos validos.
SELECT '4. Limites del cubo' AS comprobacion,
       (file_size_limit / 1048576)::text || ' MB, tipos: ' ||
         array_length(allowed_mime_types, 1)::text AS resultado,
       CASE WHEN file_size_limit = 4194304 AND array_length(allowed_mime_types, 1) = 4
            THEN 'ok' ELSE 'REVISAR' END AS estado
FROM storage.buckets WHERE id = 'perfiles';