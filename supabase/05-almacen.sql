-- ============================================================================
--  Odissey — almacenamiento de imágenes   ·   5 de 5
--  EJECUTAR DESPUÉS de 01, 02 y 03.
--
--  ESTE FICHERO SOLO CREA COSAS. NO TIENE COMPROBACIONES.
--
--  Por qué: el editor de Supabase ejecuta el script entero como UNA sola
--  transacción. Si la última consulta falla, se deshace TODO, incluido el
--  cubo. Pasó dos veces: una comprobación con "public" sin comillas (que
--  es palabra reservada) y otra con max() sobre un booleano (que no
--  existe en Postgres) tiraron abajo la creación del cubo.
--
--  Las comprobaciones se hacen aparte, desde fuera, contra la API pública
--  de Storage. Menos piezas que pueden romperse, y el resultado es el que
--  ve de verdad el navegador.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
--  EL CUBO
-- ---------------------------------------------------------------------------
--  'perfiles' es publico para LEER: el avatar se pinta en las tarjetas de
--  la web y en el perfil del staff, y ahi no hay sesion de por medio.
--
--  Para ESCRIBIR no es publico: eso lo cisplatin las cuatro politicas de
--  abajo, no el cubo.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'perfiles',
  'perfiles',
  true,
  -- 4 MB. Es el mismo tope que ponia el bot, y de sobra para un avatar o
  -- un banner. El limite evita que alguien llene el almacenamiento
  -- subiendo un video por error.
  4194304,
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
--  LECTURA: cualquiera puede ver las imagenes
-- ---------------------------------------------------------------------------
--  Se lee a traves de una URL publica (getPublicUrl), sin sesion. Por eso
--  esta politica no exige estar autenticado.
DROP POLICY IF EXISTS "perfiles lectura" ON storage.objects;
CREATE POLICY "perfiles lectura" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'perfiles');


-- ---------------------------------------------------------------------------
--  ESCRITURA: solo a la carpeta que lleva TU id
-- ---------------------------------------------------------------------------
--  LA RUTA ES  perfiles/<uuid del usuario>/avatar.jpg
--
--  El uuid va SIEMPRE en la ruta, y no por capricho: es lo que permite
--  que estas politicas digan "esta imagen es tuya" sin abrir el archivo ni
--  mirar sus metadatos. Se lee con storage.foldername(name), que devuelve
--  las carpetas de la ruta: para 'd4f1.../avatar.jpg' devuelve
--  ['d4f1...'].
--
--  Si alguien intentara escribir en 'otra-carpeta/avatar.jpg', la carpeta
--  seria ['otra-carpeta'], no coincidiria con su id y se rechaza. Esa es
--  toda la proteccion: una comparacion, y no se puede saltar desde el
--  navegador porque no es codigo del navegador, es la base de datos.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "perfiles subir" ON storage.objects;
CREATE POLICY "perfiles subir" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'perfiles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Para cambiar (subir otra vez encima) y para borrar, con el mismo
-- criterio: su carpeta y no la de otro.
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

-- ============================================================================
--  FIN
--
--  Comprobaciones (NO forman parte de este script, van aparte contra la
--  API, y las hace quien te ayude con esto):
--    1. El cubo 'perfiles' existe y es publico.
--    2. Hay 4 politicas llamadas 'perfiles ...'.
--    3. Ninguna politica de escritura es de tipo INSERT, UPDATE o DELETE
--       para el rol 'anon'.
--    4. Las tres de escritura comprueban (storage.foldername(name))[1]
--       contra auth.uid().
--    5. El limite son 4 MB y hay 4 tipos de imagen admitidos.
-- ============================================================================