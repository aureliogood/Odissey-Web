-- ============================================================================
--  Odissey — tops del servidor (BK-Tops)
--  Ejecutar en el SQL Editor de Supabase, después de los esquemas anteriores.
--
--  QUÉ HACE
--  ---------------------------------------------------------------------------
--  Crea la tabla donde se guarda el ranking que la web pinta en la portada.
--  No la escribe el navegador: la rellena scripts/sync-tops.cjs, que lee las
--  tablas de BK-Tops en MySQL y las copia aquí usando la service role key.
--
--  La web solo lee (política de SELECT pública), así que aunque alguien
--  descubra la publishable key no puede modificar los rankings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.server_tops (
  -- ID del top en BK-Tops (kills, money, time_played...).
  top_id        text        NOT NULL,
  -- Posición 1..N dentro de ese top.
  position      integer     NOT NULL CHECK (position > 0),
  -- Nombre visible del jugador (o del equipo, si es un top de equipos).
  player_name   text        NOT NULL,
  -- UUID del jugador o identificador del equipo. Se usa para la cabeza.
  player_uuid   text,
  -- Valor numérico tal cual lo guarda BK-Tops (dinero, kills o segundos).
  value         double precision NOT NULL,
  -- Formato ya resuelto por el script, por si algún día se quiere usar.
  display_value text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (top_id, position)
);

-- La web pide todos los tops ordenados; este índice evita un sort completo.
CREATE INDEX IF NOT EXISTS server_tops_top_pos
  ON public.server_tops (top_id, position);

-- RLS: lectura pública, escritura solo desde el servidor (service role).
ALTER TABLE public.server_tops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "server_tops_lectura_publica" ON public.server_tops;
CREATE POLICY "server_tops_lectura_publica"
  ON public.server_tops
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.server_tops TO anon, authenticated;

-- La service role key se salta la RLS, así que el script de sincronización
-- puede borrar e insertar sin necesidad de políticas de escritura.
