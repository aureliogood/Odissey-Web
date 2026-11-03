(function () {
  'use strict';
  const lista = document.getElementById('ban-list');
  const estado = document.getElementById('ban-status');
  const busqueda = document.getElementById('ban-search');
  let baneos = [];
  const fecha = (valor) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
  function pintar() {
    const q = busqueda.value.trim().toLocaleLowerCase('es');
    const ahora = Date.now();
    const activos = baneos.filter(b => !b.revoked_at && (!b.expires_at || Date.parse(b.expires_at) > ahora))
      .filter(b => [b.player_name, b.staff_name, b.reason].some(v => String(v || '').toLocaleLowerCase('es').includes(q)));
    lista.replaceChildren();
    estado.textContent = activos.length ? `${activos.length} baneo${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}` : '';
    if (!activos.length) {
      const empty = document.createElement('div'); empty.className = 'ban-empty';
      empty.textContent = q ? 'No hay baneos que coincidan con la búsqueda.' : 'No hay baneos activos para mostrar.';
      lista.append(empty); return;
    }
    for (const ban of activos) {
      const card = document.createElement('article'); card.className = 'ban-card';
      const name = document.createElement('div'); name.className = 'ban-name'; name.textContent = ban.player_name;
      const duration = document.createElement('div'); duration.className = 'ban-duration';
      duration.textContent = ban.expires_at ? `Hasta ${fecha(ban.expires_at)}` : 'Permanente';
      const reason = document.createElement('div'); reason.className = 'ban-reason'; reason.textContent = `Motivo: ${ban.reason}`;
      const meta = document.createElement('div'); meta.className = 'ban-meta';
      const created = document.createElement('span'); created.textContent = `Aplicado: ${fecha(ban.created_at)}`;
      const staff = document.createElement('span'); staff.textContent = `Staff: ${ban.staff_name}`;
      meta.append(created, staff); card.append(name, duration, reason, meta); lista.append(card);
    }
  }
  busqueda.addEventListener('input', pintar);
  (async function cargar() {
    try {
      const sb = await window.OdisseySupabase.rapido();
      const { data, error } = await sb.from('staff_bans').select('id,player_name,player_uuid,reason,staff_name,created_at,expires_at,revoked_at').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      baneos = data || []; pintar();
    } catch (error) {
      console.error('No se pudo cargar el registro de baneos', error);
      estado.textContent = 'No se pudo cargar el registro. Comprueba la migración y los permisos de lectura de Supabase.';
    }
  })();
})();
