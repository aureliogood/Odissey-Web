-- ============================================================================
--  EQUIPO INICIAL
--
--  La tabla staff_members estaba vacia y la pagina se quedaba en blanco.
--  No era un fallo de la pagina: era que no habia nada que enseñar. La
--  lista que si existe, en staff-config.js, nunca llegaba a usarse porque
--  /api/content devolvia staffConfigured:true siempre y, al estar la
--  base vacia, devolvia una lista vacia en vez de la de reserva.
--
--  Aqui se deja el equipo. A partir de ahora la fuente es la base de
--  datos y se edita desde el panel de admin, que ya funciona.
--
--  Para ejecutarlo mas adelante sin duplicar, ON CONFLICT.
-- ============================================================================

INSERT INTO public.staff_members
  (id, name, role, description, bio, minecraft, discord, sort_order)
VALUES
  ('aureliogood', 'aureliogood', 'Fundador',
   'Fundador de OdisseyMC.',
   'El creador de todo. Siempre buscando formas de innovar y atraer nuevos jugadores.',
   'aureliogood', 'https://discord.com/users/951551929836769312', 0),

  ('logan_beckett', 'Logan_Beckett', 'Admin',
   'Fundador de Midgard MMORPG y admin de OdisseyMC.',
   'Gestiona el servidor y ayuda a que todo funcione sin problemas.',
   'Logan_Beckett', 'https://discord.com/users/1297030726264291341', 1),

  ('moishig', 'Moishig', 'Moderadora',
   'Moderadora de OdisseyMC.',
   'Encargada de mantener la paz y resolver los conflictos del servidor.',
   'moishig', 'https://discord.com/users/1013991646293143633', 2),

  ('cenizorojo', 'CenizoRojo', 'Ayudante',
   'Fundador de Dracon y Ayudante de OdisseyMC.',
   'Siempre listo para ayudar a los nuevos jugadores con sus dudas.',
   'cenizorojo', NULL, 3)

ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  role        = EXCLUDED.role,
  description = EXCLUDED.description,
  bio         = EXCLUDED.bio,
  minecraft   = EXCLUDED.minecraft,
  discord     = EXCLUDED.discord,
  sort_order  = EXCLUDED.sort_order;


-- Comprobacion: tiene que salir una fila por miembro.
SELECT id, name, role, sort_order FROM public.staff_members ORDER BY sort_order;