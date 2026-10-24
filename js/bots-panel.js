(function () {
  'use strict';
  const API = 'http://127.0.0.1:32170';
  const $ = id => document.getElementById(id);
  const state = { tickets: null, welcome: null };
  const gate = $('gate');
  const app = $('app');
  const connection = $('connection');
  let toastTimer;

  function toast(message, error) {
    const node = $('toast');
    node.textContent = message;
    node.classList.toggle('error', !!error);
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3600);
  }

  async function sessionToken() {
    try {
      const url = String(window.SITE_CONFIG.supabaseUrl || '').replace(/\/+$/, '');
      const project = new URL(url).hostname.split('.')[0];
      const storageKey = 'sb-' + project + '-auth-token';
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (stored && stored.access_token) {
        if (!stored.expires_at || stored.expires_at * 1000 > Date.now() + 60_000) return stored.access_token;
        if (stored.refresh_token) {
          const refreshed = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST', headers: { apikey: window.SITE_CONFIG.supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: stored.refresh_token }), cache: 'no-store',
          });
          const next = await refreshed.json().catch(() => null);
          if (refreshed.ok && next && next.access_token) {
            const updated = Object.assign({}, stored, next, { expires_at: next.expires_at || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600) });
            localStorage.setItem(storageKey, JSON.stringify(updated));
            localStorage.setItem('odissey_discord_session', updated.access_token);
            return updated.access_token;
          }
        }
      }
      const legacy = localStorage.getItem('odissey_discord_session');
      if (legacy && legacy.split('.').length === 3) return legacy;
    } catch (_) { /* la API devuelve el error de acceso de forma segura */ }
    return '';
  }

  async function request(path, options) {
    const token = await sessionToken();
    if (!token) throw new Error('Inicia sesión con tu cuenta de Odissey.');
    const response = await fetch(API + path, {
      method: options && options.method || 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(options && options.body ? { 'Content-Type': 'application/json' } : {}) },
      body: options && options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      targetAddressSpace: 'loopback',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (data.error === 'admin_required') throw new Error('Esta cuenta no tiene rol de administrador.');
      if (data.error === 'origin_denied') throw new Error('Abre el panel desde odisseymc.site.');
      throw new Error(data.error || 'El conector local no respondió correctamente.');
    }
    return data;
  }

  function text(id, value) { $(id).value = value == null ? '' : value; }
  function setConnection(ok, message) {
    connection.classList.toggle('online', !!ok);
    connection.classList.toggle('offline', !ok);
    $('connectionText').textContent = message;
  }

  function previewTickets() {
    const title = $('ticketTitle').value.trim() || 'Panel de soporte';
    $('previewTitle').textContent = title.startsWith('## ') ? title.slice(3) : title;
    $('previewDescription').textContent = $('ticketDescription').value;
    $('previewFooter').textContent = $('ticketFooter').value;
    const list = $('previewCategories');
    list.replaceChildren();
    (state.tickets?.categories || []).forEach((c, index) => {
      const card = document.createElement('div');
      card.className = 'preview-option';
      const heading = document.createElement('b');
      heading.textContent = `${c.emoji ? c.emoji + ' ' : ''}${c.label || `Sección ${index + 1}`}  ·  ${c.buttonLabel || 'Abrir'}`;
      const desc = document.createElement('span');
      desc.textContent = c.description || 'Describe brevemente el motivo del ticket.';
      card.append(heading, desc);
      list.append(card);
    });
  }

  function renderCategories() {
    const list = $('categories');
    list.replaceChildren();
    $('addCategory').disabled = state.tickets.categories.length >= 5;
    state.tickets.categories.forEach((c, index) => {
      const row = document.createElement('div');
      row.className = 'category-item';
      const swatch = document.createElement('span');
      swatch.className = 'category-swatch'; swatch.style.background = c.color || '#ffaa00';
      const info = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = `${c.emoji ? c.emoji + ' ' : ''}${c.label || 'Sección sin nombre'}`;
      const description = document.createElement('p'); description.textContent = c.description || 'Sin descripción';
      info.append(title, description);
      const actions = document.createElement('div'); actions.className = 'category-actions';
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Subir'; up.disabled = index === 0;
      up.addEventListener('click', () => { [state.tickets.categories[index - 1], state.tickets.categories[index]] = [state.tickets.categories[index], state.tickets.categories[index - 1]]; renderCategories(); });
      const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.title = 'Bajar'; down.disabled = index === state.tickets.categories.length - 1;
      down.addEventListener('click', () => { [state.tickets.categories[index + 1], state.tickets.categories[index]] = [state.tickets.categories[index], state.tickets.categories[index + 1]]; renderCategories(); });
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '✎'; edit.title = 'Editar'; edit.addEventListener('click', () => openCategory(index));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = 'Eliminar'; remove.addEventListener('click', () => {
        if (state.tickets.categories.length < 2) return toast('Debe quedar al menos una sección.', true);
        state.tickets.categories.splice(index, 1); renderCategories();
      });
      actions.append(up, down, edit, remove); row.append(swatch, info, actions); list.append(row);
    });
    previewTickets();
  }

  function openCategory(index) {
    const category = index == null ? { id: '', label: '', emoji: '', description: '', categoryId: '', color: '#ffaa00', buttonLabel: 'Abrir' } : state.tickets.categories[index];
    $('dialogTitle').textContent = index == null ? 'Añadir sección' : 'Editar sección';
    text('editCategoryIndex', index == null ? '' : index);
    text('categoryLabel', category.label); text('categoryEmoji', category.emoji);
    text('categoryId', category.id); text('categoryDescription', category.description);
    text('categoryDiscordId', category.categoryId); text('categoryColor', category.color || '#ffaa00'); text('categoryButtonLabel', category.buttonLabel || 'Abrir');
    $('categoryDialog').showModal();
  }

  function render() {
    const t = state.tickets, w = state.welcome;
    text('ticketTitle', t.panel.title); text('ticketDescription', t.panel.description); text('ticketFooter', t.panel.footer);
    text('supportRoleId', t.supportRoleId); text('logsChannelId', t.logsChannelId);
    renderCategories();
    text('welcomeChannelId', w.welcomeChannelId); text('alertsChannelId', w.alertsChannelId); text('staffRoleId', w.staffRoleId);
    text('statusHost', w.status.host); text('statusPort', w.status.port); text('statusChannelId', w.status.channelId); $('statusMaintenance').checked = !!w.status.maintenance;
    text('welcomeTitle', w.welcomeMessage.title); text('welcomeDescription', w.welcomeMessage.description);
    text('welcomeColor', w.welcomeMessage.color); text('welcomeFooter', w.welcomeMessage.footer);
    text('minAccountAgeDays', w.suspicious.minAccountAgeDays); text('maxSimilarityDistance', w.suspicious.maxSimilarityDistance);
    $('checkImpersonation').checked = !!w.suspicious.checkImpersonation;
    text('protectedUsers', (w.suspicious.protectedUsers || []).map(x => x.name).filter(Boolean).join('\n'));
    text('blockedKeywords', (w.suspicious.blockedKeywords || []).join('\n'));
    previewWelcome();
  }

  function previewWelcome() {
    const title = $('welcomeTitle').value;
    const message = $('welcomeDescription').value.replaceAll('{usuario}', '@NuevoMiembro').replaceAll('{miembros}', '2,048');
    $('welcomePreviewTitle').textContent = title;
    $('welcomePreviewDescription').textContent = message;
    $('welcomePreviewFooter').textContent = $('welcomeFooter').value;
    $('welcomePreview').style.borderLeftColor = $('welcomeColor').value || '#ffaa00';
  }

  async function connectPanel() {
    $('gateTitle').textContent = 'Conectando con este PC';
    $('gateText').textContent = 'Validando la sesión y cargando la configuración de tus bots.';
    $('connectLocal').classList.add('hidden'); $('retry').classList.add('hidden');
    try {
      await request('/health');
      setConnection(true, 'Conector local disponible');
      const data = await request('/api/config');
      state.tickets = data.tickets; state.welcome = data.welcome;
      render(); gate.classList.add('hidden'); app.classList.remove('hidden');
    } catch (err) {
      const message = err.message || 'No se pudo conectar.';
      setConnection(false, /fetch|Failed to fetch|NetworkError/i.test(message) ? 'Conector local desconectado' : 'Revisa tu acceso');
      $('gateTitle').textContent = message.includes('Inicia sesión') ? 'Inicia sesión para continuar' : message.includes('administrador') ? 'Acceso solo para administradores' : 'No se pudo conectar con este PC';
      $('gateText').textContent = message.includes('fetch') || message.includes('NetworkError') ? 'Inicia el archivo iniciar-bots-panel.bat en este PC y vuelve a intentarlo.' : message;
      if (message.includes('Inicia sesión')) $('loginLink').classList.remove('hidden');
      else $('connectLocal').classList.remove('hidden');
      $('retry').classList.remove('hidden');
    }
  }

  async function load() {
    gate.classList.remove('hidden'); app.classList.add('hidden');
    $('loginLink').classList.add('hidden'); $('connectLocal').classList.add('hidden'); $('retry').classList.add('hidden');
    try {
      const token = await sessionToken();
      if (!token) throw new Error('Inicia sesión con tu cuenta de Odissey.');
      $('gateTitle').textContent = 'Conecta este PC';
      $('gateText').textContent = 'Abre iniciar-bots-panel.bat en este equipo y pulsa conectar. El navegador puede pedir permiso para hablar con este PC.';
      $('connectLocal').classList.remove('hidden');
    } catch (err) {
      $('gateTitle').textContent = 'Inicia sesión para continuar';
      $('gateText').textContent = err.message || 'Inicia sesión con una cuenta administradora de Odissey.';
      $('loginLink').classList.remove('hidden');
    }
  }

  async function save(noteId, payload) {
    const btn = noteId === 'ticketNote' ? $('saveTickets') : $('saveWelcome');
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await request('/api/config', { method: 'PUT', body: payload });
      $(noteId).textContent = 'Guardado y aplicado';
      toast('Cambios guardados. Los bots se actualizarán en unos segundos.');
      setTimeout(() => { $(noteId).textContent = ''; }, 4500);
    } catch (err) {
      $(noteId).textContent = 'No se pudo guardar'; toast(err.message, true);
    } finally { btn.disabled = false; btn.textContent = old; }
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === tab));
    document.querySelectorAll('.pane').forEach(x => x.classList.toggle('active', x.id === `pane-${tab.dataset.tab}`));
  }));
  $('connectLocal').addEventListener('click', connectPanel);
  $('retry').addEventListener('click', connectPanel);
  $('addCategory').addEventListener('click', () => openCategory(null));
  $('categoryForm').addEventListener('submit', event => {
    event.preventDefault();
    const category = { id: $('categoryId').value.trim(), label: $('categoryLabel').value.trim(), emoji: $('categoryEmoji').value.trim(), description: $('categoryDescription').value.trim(), categoryId: $('categoryDiscordId').value.trim(), color: $('categoryColor').value, buttonLabel: $('categoryButtonLabel').value.trim() || 'Abrir' };
    const rawIndex = $('editCategoryIndex').value;
    if (rawIndex === '' && state.tickets.categories.length >= 5) return toast('Discord permite hasta cinco secciones en este panel.', true);
    if (state.tickets.categories.some((c, i) => c.id === category.id && i !== Number(rawIndex))) return toast('Ese ID interno ya está en uso.', true);
    if (rawIndex === '') state.tickets.categories.push(category); else state.tickets.categories[Number(rawIndex)] = category;
    $('categoryDialog').close(); renderCategories();
  });
  $('saveTickets').addEventListener('click', () => {
    state.tickets.panel = { title: $('ticketTitle').value.trim(), description: $('ticketDescription').value.trim(), footer: $('ticketFooter').value.trim() };
    state.tickets.supportRoleId = $('supportRoleId').value.trim(); state.tickets.logsChannelId = $('logsChannelId').value.trim();
    save('ticketNote', { tickets: state.tickets, welcome: state.welcome });
  });
  $('saveWelcome').addEventListener('click', () => {
    state.welcome.welcomeChannelId = $('welcomeChannelId').value.trim(); state.welcome.alertsChannelId = $('alertsChannelId').value.trim(); state.welcome.staffRoleId = $('staffRoleId').value.trim();
    state.welcome.status = { host: $('statusHost').value.trim(), port: Number($('statusPort').value), channelId: $('statusChannelId').value.trim(), maintenance: $('statusMaintenance').checked };
    state.welcome.welcomeMessage = { title: $('welcomeTitle').value.trim(), description: $('welcomeDescription').value.trim(), color: $('welcomeColor').value, footer: $('welcomeFooter').value.trim() };
    state.welcome.suspicious = { minAccountAgeDays: Number($('minAccountAgeDays').value), maxSimilarityDistance: Number($('maxSimilarityDistance').value), checkImpersonation: $('checkImpersonation').checked, protectedUsers: $('protectedUsers').value.split('\n').map(name => name.trim()).filter(Boolean).map(name => ({ name })), blockedKeywords: $('blockedKeywords').value.split('\n').map(word => word.trim()).filter(Boolean) };
    save('welcomeNote', { tickets: state.tickets, welcome: state.welcome });
  });
  ['ticketTitle', 'ticketDescription', 'ticketFooter'].forEach(id => $(id).addEventListener('input', previewTickets));
  ['welcomeTitle', 'welcomeDescription', 'welcomeColor', 'welcomeFooter'].forEach(id => $(id).addEventListener('input', previewWelcome));
  load();
})();
