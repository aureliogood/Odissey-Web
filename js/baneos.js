(function () {
  'use strict';
  const lista = document.getElementById('ban-list');
  const estado = document.getElementById('ban-status');
  const busqueda = document.getElementById('ban-search');
  const modalDetalle = document.getElementById('ban-detail-modal');
  const modalApelacion = document.getElementById('appeal-modal');
  let baneos = [];
  let apelaciones = [];
  let usuario = null;
  let perfil = null;
  const fecha = valor => {
    if (!valor) return '—';
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  };
  const activo = b => !b.revoked_at && (!b.expires_at || Date.parse(b.expires_at) > Date.now());
  const porBaneo = id => apelaciones.filter(a => a.ban_id === id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const buscarBaneo = id => baneos.find(b => b.id === id);

  function abrir(modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
  function cerrar(modal) {
    modal.hidden = true;
    if (modalDetalle.hidden && modalApelacion.hidden && document.getElementById('loginModal').hidden) document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => cerrar(document.getElementById(b.dataset.close))));
  [modalDetalle, modalApelacion].forEach(m => m.addEventListener('click', e => { if (e.target === m) cerrar(m); }));
  window.closeLoginModal = function () { cerrar(document.getElementById('loginModal')); };
  window.openLoginModal = function () { abrir(document.getElementById('loginModal')); };

  function div(parent, className, text) {
    const node = document.createElement('div');
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  function aviso(parent, texto, tipo) {
    const p = document.createElement('p'); p.className = 'appeal-message ' + (tipo || ''); p.textContent = texto; parent.prepend(p);
  }
  function pintar() {
    const q = busqueda.value.trim().toLocaleLowerCase('es');
    const activos = baneos.filter(activo).filter(b => [b.player_name, b.staff_name, b.reason].some(v => String(v || '').toLocaleLowerCase('es').includes(q)));
    lista.replaceChildren();
    estado.textContent = `${activos.length} baneo${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`;
    if (!activos.length) {
      div(lista, 'ban-empty', q ? 'No hay baneos que coincidan con la búsqueda.' : 'No hay baneos activos para mostrar.');
      return;
    }
    for (const ban of activos) {
      const card = document.createElement('article'); card.className = 'ban-card';
      div(card, 'ban-name', ban.player_name || 'Jugador');
      div(card, 'ban-duration', ban.expires_at ? `Hasta ${fecha(ban.expires_at)}` : 'Permanente');
      div(card, 'ban-reason', `Motivo: ${ban.reason || 'Sin motivo indicado'}`);
      const meta = div(card, 'ban-meta');
      const created = document.createElement('span'); created.textContent = `Aplicado: ${fecha(ban.created_at)}`;
      const staff = document.createElement('span'); staff.textContent = `Staff: ${ban.staff_name || 'Desconocido'}`;
      meta.append(created, staff);
      const actions = div(card, 'ban-actions');
      const ver = document.createElement('button'); ver.type = 'button'; ver.className = 'ban-btn'; ver.textContent = 'Ver'; ver.addEventListener('click', () => mostrarDetalle(ban));
      const apelacion = document.createElement('button'); apelacion.type = 'button'; apelacion.className = 'ban-btn primary';
      apelacion.textContent = porBaneo(ban.id).some(a => a.status === 'open' && a.user_id === (usuario && usuario.id)) ? 'Apelación enviada' : 'Apelar';
      apelacion.disabled = apelacion.textContent !== 'Apelar';
      apelacion.addEventListener('click', () => iniciarApelacion(ban));
      actions.append(ver, apelacion); lista.append(card);
    }
  }

  function mostrarDetalle(ban) {
    const cont = document.getElementById('ban-detail-content'); cont.replaceChildren();
    const fields = [
      ['Jugador', ban.player_name], ['Motivo', ban.reason], ['Staff que aplicó la sanción', ban.staff_name],
      ['Fecha de aplicación', fecha(ban.created_at)], ['Duración', ban.expires_at ? `Hasta ${fecha(ban.expires_at)}` : 'Permanente'],
      ['UUID', ban.player_uuid || 'No disponible'], ['Servidor', ban.server_id || 'Odissey'],
      ['Estado', ban.revoked_at ? `Levantado el ${fecha(ban.revoked_at)}` : 'Activo'],
    ];
    fields.forEach(([label, value]) => { const p = document.createElement('p'); const strong = document.createElement('strong'); strong.textContent = label + ': '; p.append(strong, document.createTextNode(String(value || '—'))); cont.append(p); });
    const propia = porBaneo(ban.id).find(a => usuario && a.user_id === usuario.id);
    if (propia) {
      const box = div(cont, 'appeal-message', `Tu apelación está ${propia.status === 'open' ? 'abierta' : 'cerrada'} (enviada ${fecha(propia.created_at)}).`);
      if (propia.admin_response) div(box, '', `Respuesta de ${propia.admin_name || 'Administración'}: ${propia.admin_response}`);
    }
    abrir(modalDetalle);
  }

  function mostrarFormulario(ban) {
    const cont = document.getElementById('appeal-content'); cont.replaceChildren();
    const propia = porBaneo(ban.id).find(a => usuario && a.user_id === usuario.id && a.status === 'open');
    if (propia) { aviso(cont, 'Ya tienes una apelación abierta para este baneo. Puedes consultar su respuesta en “Ver”.', 'success'); abrir(modalApelacion); return; }
    if (!perfil || !perfil.mc_name) {
      aviso(cont, 'Antes de apelar, vincula tu nombre de Minecraft en tu perfil.', 'error');
      const a = document.createElement('a'); a.href = '/perfil'; a.textContent = 'Ir a mi perfil'; a.className = 'modal-btn primary'; cont.append(a); abrir(modalApelacion); return;
    }
    if (String(perfil.mc_name).toLowerCase() !== String(ban.player_name).toLowerCase()) {
      aviso(cont, `La cuenta de Minecraft vinculada (${perfil.mc_name}) no coincide con el jugador sancionado (${ban.player_name}).`, 'error');
      const a = document.createElement('a'); a.href = '/perfil'; a.textContent = 'Revisar mi perfil'; a.className = 'modal-btn'; cont.append(a); abrir(modalApelacion); return;
    }
    const form = document.createElement('form'); form.className = 'appeal-form';
    const intro = document.createElement('p'); intro.className = 'appeal-note'; intro.textContent = `Apelación para ${ban.player_name}. Explica por qué debería revisarse la sanción. La cuenta debe tener ese nombre de Minecraft vinculado en su perfil.`; form.append(intro);
    const label1 = document.createElement('label'); label1.append(document.createTextNode('Tu explicación *'));
    const message = document.createElement('textarea'); message.required = true; message.minLength = 20; message.maxLength = 3000; message.placeholder = 'Cuéntanos qué ocurrió y por qué solicitas que se revise (20 caracteres como mínimo).'; label1.append(message);
    const label2 = document.createElement('label'); label2.append(document.createTextNode('Pruebas o contexto adicional'));
    const evidence = document.createElement('textarea'); evidence.maxLength = 4000; evidence.placeholder = 'Describe las pruebas o pega enlaces https://… (opcional).'; label2.append(evidence);
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'modal-btn primary'; submit.textContent = 'Enviar apelación';
    form.append(label1, label2, submit);
    form.addEventListener('submit', async e => {
      e.preventDefault(); submit.disabled = true; submit.textContent = 'Enviando…';
      const result = await fetch('/api/ban-appeals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banId: ban.id, message: message.value, evidence: evidence.value }) }).then(r => r.json()).catch(() => ({ ok: false, error: 'sin_conexion' }));
      submit.disabled = false; submit.textContent = 'Enviar apelación';
      if (!result.ok) { aviso(form, traducirError(result.error), 'error'); return; }
      apelaciones.unshift(result.appeal); pintar();
      form.replaceChildren(); aviso(form, 'Apelación enviada. El equipo de administración revisará el caso.', 'success');
    });
    cont.append(form); abrir(modalApelacion);
  }

  function traducirError(error) {
    const textos = {
      vincula_minecraft: 'Vincula primero tu nombre de Minecraft en el perfil.',
      cuenta_no_coincide: 'Tu nombre de Minecraft vinculado no coincide con el jugador baneado.',
      baneo_no_activo: 'Ese baneo ya no está activo y no admite apelaciones.',
      apelacion_ya_abierta: 'Ya tienes una apelación abierta para ese baneo.',
      datos_invalidos: 'Escribe una explicación de al menos 20 caracteres.',
      no_auth: 'Inicia sesión para enviar la apelación.',
      sin_conexion: 'No se pudo conectar. Inténtalo de nuevo.',
    };
    return textos[error] || 'No se pudo enviar la apelación. Revisa la configuración de Supabase e inténtalo de nuevo.';
  }

  async function iniciarApelacion(ban) {
    if (!usuario) {
      try { sessionStorage.setItem('odyssey_login_return_to', '/baneos?appeal=' + encodeURIComponent(ban.id)); } catch (_) {}
      window.openLoginModal(); return;
    }
    mostrarFormulario(ban);
  }
  busqueda.addEventListener('input', pintar);
  window.addEventListener('keydown', e => { if (e.key === 'Escape') [modalDetalle, modalApelacion, document.getElementById('loginModal')].forEach(m => cerrar(m)); });

  (async function cargar() {
    try {
      const sb = await window.OdisseySupabase.rapido();
      await window.OdisseySupabase.sesionLista();
      usuario = await window.OdisseySupabase.usuarioActual();
      perfil = usuario ? await window.OdisseySupabase.perfilActual() : null;
      const { data, error } = await sb.from('staff_bans').select('id,server_id,player_name,player_uuid,reason,staff_name,created_at,expires_at,revoked_at').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      baneos = data || [];
      if (usuario) {
        const r = await fetch('/api/ban-appeals/mine').then(x => x.json()).catch(() => ({ ok: false }));
        if (r.ok) apelaciones = r.appeals || [];
      }
      pintar();
      const appealId = new URLSearchParams(location.search).get('appeal');
      if (appealId && usuario) {
        const ban = buscarBaneo(appealId);
        if (ban && activo(ban)) mostrarFormulario(ban);
        history.replaceState(null, '', location.pathname);
      }
    } catch (error) {
      console.error('No se pudo cargar el registro de baneos', error);
      estado.textContent = 'No se pudo cargar el registro. Comprueba la migración y los permisos de lectura de Supabase.';
      div(lista, 'ban-empty', 'El servicio de baneos no está disponible por ahora.');
    }
  })();
})();
