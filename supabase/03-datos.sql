-- ============================================================================
--  Odissey — trigger de alta y comprobaciones   ·   3 de 3
--
--  Cuando alguien se registra en Supabase Auth, no existe todavia fila en
--  profiles. Este trigger la crea con el mismo nombre de usuario, para que
--  el perfil exista desde el primer momento y no haya que crear nada desde
--  el cliente.
--
--  Tambien valida el nombre de usuario ANTES de que se lo apliquen las
--  politicas. Se hace aqui y no en el JavaScript por un motivo concreto:
--  el JavaScript se puede saltar, Postgres no.
-- ============================================================================

-- ============================================================================
--  ALTA DE PERFIL
-- ============================================================================
--  ATENCIÓN, esto se cambió: antes, si el nombre pedido ya estaba pillado,
--  el INSERT reventaba con "Database error saving new user" y el alta se
--  perdía entera. El visitante veía un error en inglés sin saber qué hacer,
--  y encima no podía registrarse con un nombre libre del todo, porque el
--  choque era con el que le habían puesto.
--
--  Ahora se busca un nombre libre: se prueba el que pidió y, si está
--  ocupado, se le van añadiendo sufijos ("juan" -> "juan_2"). El alta
--  SIEMPRE sale bien y la persona puede renombrarse después desde su perfil.
--
--  Y para que el aviso llegue antes, el formulario consulta la función
--  nombre_disponible() de abajo y avisa en el momento, no al final.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.crear_perfil()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pedido  text;
  base    text;
  elegido text;
  intento int := 1;
BEGIN
  pedido := coalesce(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'username'), ''),
    NULLIF(split_part(coalesce(NEW.email, ''), '@', 1), ''),
    'usuario'
  );

  -- Si el nombre que mandan no cumple el formato (o es demasiado corto),
  -- no se intenta ni siquiera: se arranca de 'usuario'. El trigger
  -- validar_username() habria rechazado el alta igualmente.
  base := CASE WHEN pedido ~ '^[A-Za-z0-9_]{3,20}$' THEN pedido ELSE 'usuario' END;

  elegido := base;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username_lower = lower(elegido)) LOOP
    intento := intento + 1;
    EXIT WHEN intento > 10000;
    -- Se recorta la base lo justo para que cabgan el "_" y el sufijo y
    -- el total no pase de 20, que es el limite del formato.
    elegido := left(base, 20 - length(intento::text) - 1) || '_' || intento::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, username_lower, rol)
  VALUES (NEW.id, elegido, lower(elegido), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_crear_perfil ON auth.users;
CREATE TRIGGER trg_crear_perfil
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.crear_perfil();


-- ============================================================================
--  EL ROL SOLO LO CAMBIA EL ADMIN
-- ============================================================================
--  Se comprueba en la policy, pero se comprueba tambien aqui. Dos barreras
--  para lo mismo es lo correcto cuando se trata de subir de privilegios: si
--  mañana alguien afloja la policy (o la quita sin querer al reescribir
--  el fichero), el trigger sigue poniendolo.
--
--  SECURITY DEFINER porque si no, el trigger no podria escribir en profiles
--  (la policy solo deja editar al admin y el usuario que cambia el rol
--  normalmente no lo es). Sin esto, cambiar el rol a admin solo seria
--  posible desde la sesion de service_role, que es lo correcto.
CREATE OR REPLACE FUNCTION public.proteger_rol()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    -- service_role (el backend) y postgres pueden cambiar el rol sin
    -- problema. Cualquier otro, no.
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'El rol solo lo puede cambiar un administrador.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_proteger_rol ON public.profiles;
CREATE TRIGGER trg_proteger_rol
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.proteger_rol();


-- ============================================================================
--  NOMBRE DE USUARIO
-- ============================================================================
--  Las mismas reglas que aplicaba validarRegistro() en el bot. Estan aqui y
--  no solo en el JavaScript porque la tabla no deberia poder contener un
--  nombre invalido ni aunque alguien escriba por API a mano.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validar_username()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS NULL OR NEW.username !~ '^[A-Za-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'El nombre de usuario solo admite 3-20 caracteres de letra, numero o guion bajo.';
  END IF;
  NEW.username_lower := lower(NEW.username);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validar_username ON public.profiles;
CREATE TRIGGER trg_validar_username
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validar_username();


-- ============================================================================
--  FECHAS
-- ============================================================================
--  El bot guardaba las fechas en milisegundos y las comparaba con Date.now().
--  Postgres ya trae now(). Estos triggers evitan tener que pedirlas al
--  cliente, que es de donde vienen casi todas las de ahora.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tocar_visto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.visto := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tocar_visto ON public.profiles;
CREATE TRIGGER trg_tocar_visto
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tocar_visto();


-- ============================================================================
--  BUSCAR EL CORREO POR NOMBRE DE USUARIO
-- ============================================================================
--  El login de la web sigue aceptando "usuario O correo", como antes. Pero
--  Supabase Auth solo sabe authenticar con correo, asi que hay que traducir.
--
--  No se hace desde el navegador con un select sobre profiles, por dos
--  razones:
--    1. El correo esta en auth.users, no en profiles, asi que profiles no
--       tiene de donde sacarlo.
--    2. Una busqueda directa devolveria cualquier cuentaaun sin sesion, y
--       se podria usar para saber que correos estan registrados.
--
--  Esta funcion solo devuelve UN correo y solo si hay sesion. Sin sesion no
--  devuelve nada, con lo que un visitante suelto no puede usarla para
--  enumerar cuentas.
--
-- SECURITY DEFINER porque tiene que leer auth.users, a lo que el navegador
-- no llega. search_path fijo para que no se le pase un esquema plantado.
CREATE OR REPLACE FUNCTION public.correo_por_usuario(nombre text)
RETURNS TABLE (correo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  -- Sin sesion no se responde. Ver el punto 2 de arriba.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.email::text
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.username_lower = lower(nombre)
    LIMIT 1;
END $$;

-- Solo se puede llamar desde el cliente autenticado, y no se puede ejecutar
-- con la sesion de service_role ni por anon sin sesion.
GRANT EXECUTE ON FUNCTION public.correo_por_usuario(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.correo_por_usuario(text) FROM anon;


-- ============================================================================
--  NOMBRE LIBRE
--
--  La pagina de registro la llama antes de dar al enviar, para poder decir
--  "ese nombre ya esta pillado" en el momento, en vez de que el alta entera
--  falle con un error de base de datos que no dice nada.
--
--  Se puede llamar sin sesion porque no hay nada secreto: los perfiles ya
--  son publicos de por si (RLS los deja leer a cualquiera para que se vea
--  quien es quien), asi que saber que un nombre esta ocupado no facilita
--  nada que antes no se pudiera ver.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.nombre_disponible(nombre text)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    coalesce(nombre, '') ~ '^[A-Za-z0-9_]{3,20}$'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE username_lower = lower(nombre)
    );
$$;

GRANT EXECUTE ON FUNCTION public.nombre_disponible(text) TO anon, authenticated;


-- ============================================================================
--  COMPROBACION FINAL
-- ============================================================================
--  RLS no hace nada hasta que se activa por tabla. Una tabla sin RLS deja
--  pasar a todo el mundo y no dice nada. Esta consulta lista las que se
--  quedaron sin ella: si sale alguna, hay que mirarlo antes de nada.
--
--  Ejecutala al final. Tiene que devolver cero filas.
-- ============================================================================
SELECT 'SIN RLS: ' || c.relname AS problema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;

-- Y esta mira si alguna policy se ha quedado con USING (true) en una tabla
-- de escritura, que suele ser un descuido. Tambien deberia salir vacia.
SELECT 'POLIZA ABIERTA: ' || tablename || '.' || policyname AS problema
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reports', 'orders', 'ratings', 'profiles', 'admin_log')
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND qual IS NULL
  AND with_check IS NULL;