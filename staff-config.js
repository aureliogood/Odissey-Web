// =============================================================
// CONFIGURACIÓN DEL STAFF
// -------------------------------------------------------------
// Centraliza la información del equipo. Edita esta lista.
// Cada miembro:
//   name        : nombre visible
//   role        : cargo
//   description : descripción corta (aparece en su panel)
//   bio         : texto breve que se muestra en el perfil del staff
//   minecraft   : usuario de Minecraft (para la skin)
//   discord     : URL de contacto por Discord (null si no tiene)
// NOTA: el panel de admin puede sobrescribir desde el navegador.
// =============================================================
window.STAFF = [
    { name: 'aureliogood', role: 'Fundador', description: 'Fundador de OdisseyMC.', bio: 'El creador de todo. Siempre buscando formas de innovar y atraer nuevos jugadores.', minecraft: 'aureliogood', discord: 'https://discord.com/users/951551929836769312' },
    { name: 'Logan_Beckett', role: 'Admin', description: 'Fundador de Midgard MMORPG y admin de OdisseyMC.', bio: 'Gestiona el servidor y ayuda a que todo funcione sin problemas.', minecraft: 'Logan_Beckett', discord: 'https://discord.com/users/1297030726264291341' },
];
// Filtra filas antiguas que todavía pueden existir en la base de datos.
window.STAFF_REMOVED_NAMES = ['moishig', 'cenizorojo'];
