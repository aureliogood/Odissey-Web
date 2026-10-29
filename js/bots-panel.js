(function () {
  'use strict';
  const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:32170'
    : 'https://api.odisseymc.site/panel';
  const $ = id => document.getElementById(id);
  const state = { tickets: null, welcome: null, announcements: [], directory: { channels: [], categories: [], roles: [] }, permissions: [], isAdmin: false };
  const gate = $('gate');
  const app = $('app');
  const connection = $('connection');
  let toastTimer;
  let announcementImagePreviewUrls = [];
  const announcementImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  const announcementImageLimit = 5 * 1024 * 1024;

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
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      if (data.error === 'admin_required') throw new Error('Esta cuenta no tiene rol de administrador.');
      if (data.error === 'permission_denied') throw new Error('Tu rol no tiene permiso para esta acción.');
      if (data.error === 'origin_denied') throw new Error('Abre el panel desde odisseymc.site.');
      if (data.error === 'announcement_rate_limited') throw new Error('Espera unos segundos antes de publicar otro mensaje.');
      if (data.error === 'announcement_channel_required') throw new Error('Configura el canal de anuncios y guarda los cambios primero.');
      if (data.error === 'announcement_schedule_invalid') throw new Error('La fecha debe estar en el futuro y dentro del próximo año.');
      if (data.error === 'announcement_required') throw new Error('Escribe un título y un mensaje antes de publicar.');
      if (data.error === 'announcement_image_invalid') throw new Error('La imagen debe ser PNG, JPG, GIF o WebP y pesar 5 MB o menos.');
      if (data.error === 'announcement_button_label') throw new Error('Escribe el texto del botón para poder añadir el enlace.');
      if (String(data.error || '').startsWith('invalid_announcement_') || data.error === 'invalid_welcome_image_url') throw new Error('Las imágenes y enlaces deben usar una URL HTTPS válida.');
      if (data.error === 'ticket_not_open') throw new Error('Ese ticket ya no está abierto. Actualiza la lista.');
      if (data.error === 'discord_directory_unavailable') throw new Error('No pude consultar Discord. Comprueba que ambos bots estén en línea y tengan acceso al servidor.');
      throw new Error(data.error || 'El servicio de Azure no respondió correctamente.');
    }
    return data;
  }

  function text(id, value) { $(id).value = value == null ? '' : value; }
  function safePreviewUrl(value) {
    try { const url = new URL(String(value || '').trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
    catch (_) { return ''; }
  }
  function fillSelect(id, items, selected, placeholder) {
    const select = $(id); select.replaceChildren();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = placeholder; select.append(empty);
    let found = false;
    items.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; if (item.id === selected) found = true; select.append(option); });
    if (selected && !found) { const old = document.createElement('option'); old.value = selected; old.textContent = `Guardado (${selected})`; select.append(old); }
    select.value = selected || '';
  }

  function renderDiscordDirectory() {
    const d = state.directory;
    [['supportRoleId', d.roles, state.tickets.supportRoleId, 'Selecciona el rol'], ['staffRoleId', d.roles, state.welcome.staffRoleId, 'Selecciona el rol'],
      ['logsChannelId', d.channels, state.tickets.logsChannelId, 'Selecciona el canal'], ['welcomeChannelId', d.channels, state.welcome.welcomeChannelId, 'Selecciona el canal'],
      ['alertsChannelId', d.channels, state.welcome.alertsChannelId, 'Selecciona el canal'], ['announcementChannelId', d.channels, state.welcome.announcementChannelId, 'Selecciona el canal'],
      ['statusChannelId', d.channels, state.welcome.status.channelId, 'Selecciona el canal'], ['leaveChannelId', d.channels, state.welcome.leaveMessage.channelId, 'Selecciona el canal'],
      ['categoryDiscordId', d.categories, '', 'Sin categoría']].forEach(([id, items, value, prompt]) => fillSelect(id, items, value, prompt));
    const exempt = new Set((state.welcome.autoMod?.exemptRoleIds || []).map(String));
    const roleSelect = $('autoModExemptRoles'); roleSelect.replaceChildren();
    d.roles.forEach(role => { const option = document.createElement('option'); option.value = role.id; option.textContent = role.name; option.selected = exempt.has(role.id); roleSelect.append(option); });
    exempt.forEach(id => { if (![...roleSelect.options].some(option => option.value === id)) { const option = document.createElement('option'); option.value = id; option.textContent = `Guardado (${id})`; option.selected = true; roleSelect.append(option); } });
  }
  function setConnection(ok, message) {
    connection.classList.toggle('online', !!ok);
    connection.classList.toggle('offline', !ok);
    $('connectionText').textContent = message;
  }

  function can(permission) { return state.isAdmin || state.permissions.includes(permission); }

  function applyAccess() {
    const tabs = { tickets: can('tickets:read') || can('config:read'), welcome: ['announcements:read', 'announcements:write', 'moderation:read', 'botstatus:read', 'config:read'].some(can), activity: state.isAdmin || ['analytics:read', 'alerts:read'].some(can) };
    document.querySelectorAll('.tab').forEach(tab => { tab.hidden = !tabs[tab.dataset.tab]; });
    Object.entries(tabs).forEach(([name, visible]) => { $(`pane-${name}`).hidden = !visible; });
    if (!tabs[document.querySelector('.tab.active')?.dataset.tab]) {
      const first = Object.keys(tabs).find(name => tabs[name]);
      document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === first));
      if (first) $(`pane-${first}`).classList.add('active');
    }
    if (!can('config:write')) {
      ['saveTickets', 'saveWelcome'].forEach(id => { if ($(id)) $(id).hidden = true; });
      document.querySelectorAll('#pane-tickets .form-card input, #pane-tickets .form-card textarea, #pane-tickets .form-card select, #pane-welcome .form-card input, #pane-welcome .form-card textarea, #pane-welcome .form-card select').forEach(el => {
        if (!['ticketStatusFilter', 'ticketSearch'].includes(el.id) && !el.id.startsWith('announcement')) el.disabled = true;
      });
      ['addCategory', 'saveTickets', 'saveWelcome'].forEach(id => { if ($(id)) $(id).hidden = true; });
      if (!can('announcements:write')) ['sendAnnouncement', 'saveAnnouncementDraft'].forEach(id => { if ($(id)) $(id).hidden = true; });
      if (!can('announcements:read') && !can('announcements:write')) $('refreshAnnouncements').hidden = true;
    }
    $('panelPermissionsCard').hidden = !state.isAdmin;
    $('auditCard').hidden = !state.isAdmin;
    if (!can('config:read')) {
      ['ticketTitle', 'ticketDescription', 'ticketFooter', 'supportRoleId', 'logsChannelId', 'categoryDiscordId', 'addCategory', 'categories', 'welcomeChannelId', 'alertsChannelId', 'staffRoleId', 'welcomeTitle', 'welcomeDescription', 'welcomeColor', 'welcomeFooter', 'welcomeImageUrl', 'leaveEnabled', 'leaveChannelId', 'leaveTitle', 'leaveDescription', 'leaveColor', 'statusHost', 'statusPort', 'statusChannelId', 'statusMaintenance', 'minAccountAgeDays', 'maxSimilarityDistance', 'checkImpersonation', 'protectedUsers', 'blockedKeywords', 'autoModEnabled', 'autoModInvites', 'autoModMaxMentions', 'autoModMessageLimit', 'autoModTimeout', 'autoModExemptRoles'].forEach(id => {
        const node = $(id); if (node) (node.closest('label') || node).hidden = true;
      });
    }
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
    fillSelect('categoryDiscordId', state.directory.categories, category.categoryId || '', 'Sin categoría');
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
    renderDiscordDirectory();
    renderCategories();
    $('leaveEnabled').checked = w.leaveMessage.enabled === true;
    text('leaveTitle', w.leaveMessage.title); text('leaveDescription', w.leaveMessage.description); text('leaveColor', w.leaveMessage.color);
    const autoMod = w.autoMod || {};
    $('autoModEnabled').checked = autoMod.enabled === true;
    $('autoModInvites').checked = autoMod.filterInvites !== false;
    text('autoModMaxMentions', autoMod.maxMentions ?? 5); text('autoModMessageLimit', autoMod.messageLimit ?? 7);
    text('autoModTimeout', autoMod.timeoutMinutes ?? 10);
    text('statusHost', w.status.host); text('statusPort', w.status.port); $('statusMaintenance').checked = !!w.status.maintenance;
    text('welcomeTitle', w.welcomeMessage.title); text('welcomeDescription', w.welcomeMessage.description);
    text('welcomeColor', w.welcomeMessage.color); text('welcomeFooter', w.welcomeMessage.footer);
    text('welcomeImageUrl', w.welcomeMessage.imageUrl || '');
    text('minAccountAgeDays', w.suspicious.minAccountAgeDays); text('maxSimilarityDistance', w.suspicious.maxSimilarityDistance);
    $('checkImpersonation').checked = !!w.suspicious.checkImpersonation;
    text('protectedUsers', (w.suspicious.protectedUsers || []).map(x => x.name).filter(Boolean).join('\n'));
    text('blockedKeywords', (w.suspicious.blockedKeywords || []).join('\n'));
    previewWelcome();
    previewAnnouncement();
    refreshTickets(); refreshModeration(); refreshBotStatus();
  }

  function previewWelcome() {
    const title = $('welcomeTitle').value;
    const message = $('welcomeDescription').value.replaceAll('{usuario}', '@NuevoMiembro').replaceAll('{servidor}', 'Odissey MC').replaceAll('{miembros}', '2,048');
    $('welcomePreviewTitle').textContent = title;
    $('welcomePreviewDescription').textContent = message;
    $('welcomePreviewFooter').textContent = $('welcomeFooter').value;
    $('welcomePreview').style.borderLeftColor = $('welcomeColor').value || '#ffaa00';
    const image = $('welcomePreviewImage');
    const imageUrl = safePreviewUrl($('welcomeImageUrl').value);
    image.hidden = !imageUrl;
    if (imageUrl) image.src = imageUrl;
  }

  function setPreviewScreen(name) {
    document.querySelectorAll('[data-preview-screen]').forEach(button => {
      const active = button.dataset.previewScreen === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.preview-screen').forEach(screen => {
      const active = screen.id === `${name}PreviewScreen`;
      screen.hidden = !active;
      screen.classList.toggle('active', active);
    });
  }

  function previewAnnouncement() {
    const isEvent = $('announcementType').value === 'event';
    $('announcementPreviewKind').textContent = isEvent ? 'ODISSEY · EVENTO' : 'ODISSEY · ANUNCIO';
    $('announcementPreviewTitle').textContent = $('announcementTitle').value.trim() || 'Tu título aparecerá aquí';
    $('announcementPreviewDescription').textContent = $('announcementDescription').value.trim() || 'La vista previa del anuncio aparecerá aquí.';
    const previewImages = $('announcementPreviewImages'); previewImages.replaceChildren();
    announcementImagePreviewUrls.forEach((url, index) => { const img = document.createElement('img'); img.className = 'announcement-preview-image'; img.alt = `Imagen ${index + 1} del anuncio`; img.src = url; previewImages.append(img); });
    $('announcementDiscordEmbed').style.borderLeftColor = $('announcementColor').value || '#ffaa00';
    $('announcementPreviewFooter').textContent = $('announcementFooter').value.trim() || 'Odissey MC · Información oficial';
    const buttonUrl = safePreviewUrl($('announcementButtonUrl').value);
    const previewButton = $('announcementPreviewButton'); previewButton.hidden = !buttonUrl; previewButton.textContent = $('announcementButtonLabel').value.trim() || 'Más información'; if (buttonUrl) previewButton.href = buttonUrl; else previewButton.removeAttribute('href');
    const thumbnailUrl = safePreviewUrl($('announcementThumbnailUrl').value);
    const thumbnail = $('announcementPreviewThumbnail'); thumbnail.hidden = !thumbnailUrl; if (thumbnailUrl) thumbnail.src = thumbnailUrl;
    const eventAt = $('announcementEventAt').value.trim();
    $('announcementPreviewEventDate').hidden = !isEvent || !eventAt;
    $('announcementPreviewEventDate').textContent = eventAt ? `📅 ${eventAt}` : '';
    const localDate = $('announcementSchedule').value;
    $('announcementPreviewSchedule').hidden = !localDate;
    $('announcementPreviewSchedule').textContent = localDate
      ? `Se publicará: ${new Date(localDate).toLocaleString('es-CO')}` : '';
    $('sendAnnouncement').textContent = $('announcementSchedule').value
      ? (isEvent ? 'Programar evento' : 'Programar anuncio')
      : (isEvent ? 'Publicar evento' : 'Publicar anuncio');
  }

  function clearAnnouncementImage() {
    announcementImagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    announcementImagePreviewUrls = [];
    $('announcementImage').value = '';
    $('removeAnnouncementImage').hidden = true;
    $('announcementPreviewImages').replaceChildren();
    previewAnnouncement();
  }

  function encodeAnnouncementImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        if (comma < 0) return reject(new Error('No se pudo leer la imagen.'));
        resolve({ type: file.type, data: result.slice(comma + 1) });
      };
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }

  function chooseAnnouncementImage() {
    const files = [...$('announcementImage').files];
    if (!files.length) { clearAnnouncementImage(); return; }
    if (files.length > 3 || files.some(file => !announcementImageTypes.includes(file.type) || file.size > announcementImageLimit || !file.size)) {
      clearAnnouncementImage();
      toast('Elige hasta 3 imágenes PNG, JPG, GIF o WebP de hasta 5 MB cada una.', true);
      return;
    }
    announcementImagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    announcementImagePreviewUrls = files.map(file => URL.createObjectURL(file));
    $('removeAnnouncementImage').hidden = false;
    previewAnnouncement();
    setPreviewScreen('announcement');
  }

  function renderAnnouncements(items) {
    state.announcements = Array.isArray(items) ? items : [];
    const list = $('announcementHistory');
    list.replaceChildren();
    if (!state.announcements.length) {
      const empty = document.createElement('p'); empty.className = 'hint';
      empty.textContent = 'Todavía no hay anuncios ni eventos.'; list.append(empty); return;
    }
    state.announcements.forEach(item => {
      const row = document.createElement('article'); row.className = 'announcement-row';
      const copy = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = item.title || 'Publicación';
      const meta = document.createElement('small');
      const when = item.status === 'sent' && item.sentAt ? new Date(item.sentAt) : item.scheduledAt ? new Date(item.scheduledAt) : new Date(item.createdAt);
      const statusLabel = item.status === 'draft' ? 'Borrador' : item.status === 'sent' ? 'Publicado' : item.status === 'failed' ? 'Error' : item.status === 'sending' ? 'Publicando' : item.scheduledAt ? 'Programado' : 'En cola';
      const recurrence = item.repeatEvery === 'weekly' ? ' · Cada semana' : item.repeatEvery === 'monthly' ? ' · Cada 30 días' : '';
      meta.textContent = `${item.type === 'event' ? 'Evento' : 'Anuncio'} · ${statusLabel}${recurrence} · ${when.toLocaleString('es-CO')}`;
      copy.append(title, meta);
      const badge = document.createElement('span'); badge.className = `announcement-status ${item.status || 'pending'}`; badge.textContent = statusLabel;
      row.append(copy, badge);
      if (item.error) { const error = document.createElement('small'); error.className = 'announcement-error'; error.textContent = item.error; row.append(error); }
      if (can('announcements:write') && ['draft', 'pending'].includes(item.status)) {
        const actions = document.createElement('div'); actions.className = 'announcement-row-actions';
        if (item.status === 'draft') { const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'button secondary'; publish.textContent = 'Publicar borrador'; publish.addEventListener('click', async () => { publish.disabled = true; try { await request(`/api/announcements/${encodeURIComponent(item.id)}/publish`, { method: 'POST', body: {} }); toast('Borrador enviado a la cola.'); await refreshAnnouncements(); } catch (err) { toast(err.message || 'No se pudo publicar.', true); publish.disabled = false; } }); actions.append(publish); }
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button secondary'; cancel.textContent = item.status === 'draft' ? 'Eliminar' : 'Cancelar'; cancel.addEventListener('click', async () => { cancel.disabled = true; try { await request(`/api/announcements/${encodeURIComponent(item.id)}/cancel`, { method: 'DELETE' }); toast(item.status === 'draft' ? 'Borrador eliminado.' : 'Publicación programada cancelada.'); await refreshAnnouncements(); } catch (err) { toast(err.message || 'No se pudo cancelar.', true); cancel.disabled = false; } }); actions.append(cancel); row.append(actions);
      }
      list.append(row);
    });
  }

  async function refreshAnnouncements() {
    if (!can('announcements:read') && !can('announcements:write')) return;
    try { const data = await request('/api/announcements'); renderAnnouncements(data.announcements); }
    catch (err) { toast(err.message || 'No se pudo actualizar el historial.', true); }
  }

  async function refreshTickets() {
    if (!can('tickets:read')) return;
    const list = $('openTickets');
    try {
      const params = new URLSearchParams({ status: $('ticketStatusFilter').value, q: $('ticketSearch').value.trim() });
      const data = await request('/api/tickets?' + params.toString()); list.replaceChildren();
      if (!data.tickets.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'No hay tickets que coincidan.'; list.append(empty); return; }
      data.tickets.forEach(ticket => {
        const row = document.createElement('article'); row.className = 'dashboard-row';
        const info = document.createElement('div'); const title = document.createElement('b'); title.textContent = `Ticket #${ticket.id} · ${ticket.category}`;
        const meta = document.createElement('small'); meta.textContent = `${ticket.status === 'open' ? 'Abierto' : 'Cerrado'} · ${new Date(Number(ticket.createdAt)).toLocaleString('es-CO')} · Usuario ${ticket.userId}`;
        info.append(title, meta);
        const link = document.createElement('a'); link.href = `https://discord.com/channels/${ticket.guildId}/${ticket.channelId}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Abrir';
        const action = ticket.status === 'open' ? 'close' : 'reopen';
        const change = document.createElement('button'); change.type = 'button'; change.className = 'button mini'; change.textContent = action === 'close' ? 'Cerrar' : 'Reabrir';
        change.addEventListener('click', async () => {
          const prompt = action === 'close' ? `¿Cerrar el ticket #${ticket.id}? El bot guardará su transcript.` : `¿Reabrir el ticket #${ticket.id}?`;
          if (!window.confirm(prompt)) return;
          change.disabled = true;
          try { await request(`/api/tickets/${ticket.id}/${action}`, { method: 'POST', body: {} }); toast('Solicitud enviada al bot. Actualizando la lista…'); setTimeout(refreshTickets, 2500); }
          catch (err) { toast(err.message, true); change.disabled = false; }
        });
        row.append(info, link, change); list.append(row);
      });
    } catch (err) { list.textContent = err.message || 'No se pudo consultar los tickets.'; }
  }

  async function refreshBotStatus() {
    if (!can('botstatus:read')) return;
    try {
      const data = await request('/api/status');
      for (const key of ['tickets', 'welcome']) {
        const bot = data.bots[key]; const label = key === 'tickets' ? 'tickets' : 'welcome';
        $(`${label}BotStatus`).textContent = bot.online ? `En línea${bot.tag ? ` · ${bot.tag}` : ''}` : 'Sin señal';
        $(`${label}BotStatus`).className = bot.online ? 'health-online' : 'health-offline';
        $(`${label}BotHeartbeat`).textContent = bot.heartbeatAt ? `Última señal: ${new Date(bot.heartbeatAt).toLocaleTimeString('es-CO')}` : 'Aún sin señal del bot';
      }
    } catch (_) { $('ticketsBotStatus').textContent = 'No disponible'; $('welcomeBotStatus').textContent = 'No disponible'; }
  }

  async function refreshModeration() {
    if (!can('moderation:read')) return;
    const list = $('moderationActivity');
    try {
      const data = await request('/api/moderation'); list.replaceChildren();
      if (!data.events.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Todavía no hay acciones registradas.'; list.append(empty); return; }
      data.events.slice(0, 20).forEach(event => {
        const row = document.createElement('article'); row.className = 'dashboard-row';
        const info = document.createElement('div'); const title = document.createElement('b'); title.textContent = event.action === 'timeout' ? 'Timeout aplicado' : 'Mensaje eliminado';
        const meta = document.createElement('small'); meta.textContent = `${event.userTag || event.userId || 'Usuario'} · ${event.reason || 'Automoderación'} · ${new Date(event.at).toLocaleString('es-CO')}`;
        info.append(title, meta); row.append(info); list.append(row);
      });
    } catch (err) { list.textContent = err.message || 'No se pudo cargar la actividad.'; }
  }

  async function refreshActivity() {
    if (can('analytics:read')) {
      try {
        const data = (await request('/api/analytics')).analytics;
        const summary = $('analyticsSummary'); summary.replaceChildren();
        const cards = [['Tickets abiertos', data.tickets.open], ['Tickets totales', data.tickets.total], ['Nuevos tickets', data.tickets.recent], ['Miembros nuevos', data.joins.recent]];
        cards.forEach(([label, value]) => { const card = document.createElement('div'); card.className = 'analytics-stat'; const number = document.createElement('b'); number.textContent = String(value); const caption = document.createElement('small'); caption.textContent = label; card.append(number, caption); summary.append(card); });
        const chart = $('analyticsChart'); chart.replaceChildren();
        const max = Math.max(1, ...data.members.flatMap(day => [day.joins, day.leaves, day.tickets]));
        data.members.filter((_, index) => index % 3 === 0 || index === data.members.length - 1).forEach(day => {
          const col = document.createElement('div'); col.className = 'analytics-day'; const bar = document.createElement('span');
          const total = day.joins + day.leaves + day.tickets; bar.style.height = `${Math.max(3, Math.round(total / max * 100))}%`; bar.title = `${day.date}: ${day.joins} entraron · ${day.leaves} salieron · ${day.tickets} tickets`;
          const date = document.createElement('small'); date.textContent = day.date.slice(5); col.append(bar, date); chart.append(col);
        });
      } catch (err) { $('analyticsSummary').textContent = err.message; }
    }
    if (can('alerts:read')) {
      try {
        const list = $('alertsList'); list.replaceChildren(); const alerts = (await request('/api/alerts')).alerts;
        if (!alerts.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Sin alertas activas.'; list.append(empty); }
        alerts.forEach(alert => { const row = document.createElement('article'); row.className = 'dashboard-row alert-row'; const text = document.createElement('div'); const title = document.createElement('b'); title.textContent = alert.title; const detail = document.createElement('small'); detail.textContent = `${alert.description} · ${new Date(alert.at).toLocaleString('es-CO')}`; text.append(title, detail); row.append(text); list.append(row); });
      } catch (err) { $('alertsList').textContent = err.message; }
    }
    if (can('config:read')) {
      try {
        const list = $('configVersions'); list.replaceChildren(); const versions = (await request('/api/history')).versions;
        if (!versions.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'El historial aparecerá después del primer cambio.'; list.append(empty); }
        versions.forEach(version => { const row = document.createElement('article'); row.className = 'dashboard-row'; const info = document.createElement('div'); const title = document.createElement('b'); title.textContent = version.note || 'Configuración'; const meta = document.createElement('small'); meta.textContent = `${version.actorEmail || version.actorId} · ${new Date(version.at).toLocaleString('es-CO')}`; info.append(title, meta); row.append(info); if (can('config:write')) { const restore = document.createElement('button'); restore.className = 'button mini'; restore.textContent = 'Restaurar'; restore.addEventListener('click', async () => { if (!confirm('¿Restaurar esta configuración? Se guardará la versión actual antes de hacerlo.')) return; try { await request(`/api/history/${version.id}/restore`, { method: 'POST', body: {} }); toast('Configuración restaurada.'); await connectPanel(); await refreshActivity(); } catch (err) { toast(err.message, true); } }); row.append(restore); } list.append(row); });
      } catch (err) { $('configVersions').textContent = err.message; }
    }
    if (state.isAdmin) {
      try {
        const result = await request('/api/permissions'); const box = $('permissionOptions'); box.replaceChildren();
        const labels = { 'config:read': 'Ver configuración', 'config:write': 'Modificar configuración', 'tickets:read': 'Ver y buscar tickets', 'tickets:close': 'Cerrar tickets', 'tickets:reopen': 'Reabrir tickets', 'announcements:read': 'Ver anuncios y borradores', 'announcements:write': 'Publicar y programar anuncios', 'moderation:read': 'Ver moderación', 'analytics:read': 'Ver métricas', 'alerts:read': 'Ver alertas', 'botstatus:read': 'Ver estado de bots' };
        result.available.forEach(permission => { const label = document.createElement('label'); label.className = 'permission-option'; const input = document.createElement('input'); input.type = 'checkbox'; input.value = permission; input.checked = result.permissions.includes(permission); const text = document.createElement('span'); text.textContent = labels[permission] || permission; label.append(input, text); box.append(label); });
      } catch (err) { $('permissionOptions').textContent = err.message; }
      try {
        const list = $('auditList'); list.replaceChildren(); const entries = (await request('/api/audit')).entries;
        if (!entries.length) { const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Todavía no hay cambios registrados.'; list.append(empty); }
        entries.forEach(entry => { const row = document.createElement('article'); row.className = 'dashboard-row'; const title = document.createElement('b'); title.textContent = entry.action; const meta = document.createElement('small'); meta.textContent = `${entry.actorEmail || entry.actorId} · ${new Date(entry.at).toLocaleString('es-CO')}`; row.append(title, meta); list.append(row); });
      } catch (err) { $('auditList').textContent = err.message; }
    }
  }

  async function savePanelPermissions() {
    const staff = [...$('permissionOptions').querySelectorAll('input:checked')].map(input => input.value);
    try { await request('/api/permissions', { method: 'PUT', body: { staff } }); toast('Permisos del rol Staff actualizados.'); await refreshActivity(); }
    catch (err) { toast(err.message || 'No se pudieron guardar los permisos.', true); }
  }

  async function submitAnnouncement(asDraft = false) {
    const button = $('sendAnnouncement');
    const activeButton = asDraft ? $('saveAnnouncementDraft') : button;
    const oldText = activeButton.textContent; activeButton.disabled = true; activeButton.textContent = asDraft ? 'Guardando…' : 'Enviando…';
    try {
      const localDate = $('announcementSchedule').value;
      const selectedImages = [...$('announcementImage').files];
      const images = await Promise.all(selectedImages.map(encodeAnnouncementImage));
      const data = await request('/api/announcements', { method: 'POST', body: {
        action: asDraft ? 'draft' : 'publish',
        channelId: $('announcementChannelId').value.trim(), type: $('announcementType').value,
        title: $('announcementTitle').value.trim(), description: $('announcementDescription').value.trim(),
        color: $('announcementColor').value,
        buttonLabel: $('announcementButtonLabel').value.trim(), buttonUrl: $('announcementButtonUrl').value.trim(),
        thumbnailUrl: $('announcementThumbnailUrl').value.trim(), footer: $('announcementFooter').value.trim(),
        eventAt: $('announcementEventAt').value.trim(),
        scheduledAt: localDate ? new Date(localDate).toISOString() : '',
        repeatEvery: $('announcementRepeat').value,
        ...(images.length ? { images } : {}),
      } });
      $('announcementNote').textContent = asDraft ? 'Borrador guardado' : data.announcement?.scheduledAt ? 'Programado' : 'Enviado a la cola';
      $('announcementTitle').value = ''; $('announcementDescription').value = ''; $('announcementEventAt').value = ''; $('announcementSchedule').value = ''; $('announcementRepeat').value = ''; $('announcementButtonLabel').value = ''; $('announcementButtonUrl').value = ''; $('announcementThumbnailUrl').value = '';
      clearAnnouncementImage();
      previewAnnouncement(); await refreshAnnouncements();
      toast(asDraft ? 'Borrador guardado. Puedes publicarlo desde la actividad reciente.' : data.announcement?.scheduledAt ? 'Quedó programado. El bot lo publicará a la hora indicada.' : 'El bot publicará el mensaje en unos segundos.');
    } catch (err) { $('announcementNote').textContent = 'No se pudo enviar'; toast(err.message || 'No se pudo publicar.', true); }
    finally { activeButton.disabled = false; activeButton.textContent = oldText; previewAnnouncement(); }
  }

  async function connectPanel() {
    $('gateTitle').textContent = 'Conectando con Azure';
    $('gateText').textContent = 'Validando la sesión y cargando la configuración de tus bots.';
    $('connectLocal').classList.add('hidden'); $('retry').classList.add('hidden');
    try {
      await request('/health');
      setConnection(true, 'Conectado con Azure');
      const access = await request('/api/access'); state.permissions = access.permissions; state.isAdmin = access.isAdmin; applyAccess();
      if (can('config:read')) {
        const data = await request('/api/config'); state.tickets = data.tickets; state.welcome = data.welcome;
        try { const directory = await request('/api/directory'); state.directory = directory.directory; }
        catch (_) { toast('No pude cargar los canales y roles. Revisa que los bots tengan acceso al servidor.', true); }
        render();
      } else {
        if (can('tickets:read')) refreshTickets();
        refreshBotStatus(); refreshModeration();
      }
      if (can('announcements:read') || can('announcements:write')) { const announcements = await request('/api/announcements'); renderAnnouncements(announcements.announcements); }
      gate.classList.add('hidden'); app.classList.remove('hidden');
      refreshActivity();
    } catch (err) {
      const message = err.message || 'No se pudo conectar.';
      setConnection(false, /fetch|Failed to fetch|NetworkError/i.test(message) ? 'Azure no responde' : 'Revisa tu acceso');
      $('gateTitle').textContent = message.includes('Inicia sesión') ? 'Inicia sesión para continuar' : message.includes('administrador') ? 'Acceso solo para administradores' : 'No se pudo conectar con Azure';
      $('gateText').textContent = message.includes('fetch') || message.includes('NetworkError') ? 'Comprueba la conexión con Azure e inténtalo de nuevo.' : message;
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
      $('gateTitle').textContent = 'Conecta con Azure';
      $('gateText').textContent = 'La configuración se cargará desde el servidor de Azure.';
      $('connectLocal').textContent = 'Conectar con Azure';
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
      const issueBox = $(noteId === 'ticketNote' ? 'ticketPermissionIssues' : 'welcomePermissionIssues');
      const check = await request('/api/config/check', { method: 'POST', body: payload });
      issueBox.replaceChildren(); issueBox.hidden = !check.issues.length;
      check.issues.forEach(issue => { const line = document.createElement('p'); line.textContent = `${issue.bot} · ${issue.label}: ${issue.missing.join(', ')}`; issueBox.append(line); });
      if (check.issues.length) { $(noteId).textContent = 'Revisa los permisos'; toast('No guardé los cambios porque uno o más bots no tienen acceso a los destinos seleccionados.', true); return; }
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
    state.welcome.welcomeChannelId = $('welcomeChannelId').value.trim(); state.welcome.alertsChannelId = $('alertsChannelId').value.trim(); state.welcome.staffRoleId = $('staffRoleId').value.trim(); state.welcome.announcementChannelId = $('announcementChannelId').value.trim();
    state.welcome.status = { host: $('statusHost').value.trim(), port: Number($('statusPort').value), channelId: $('statusChannelId').value.trim(), maintenance: $('statusMaintenance').checked };
    state.welcome.welcomeMessage = { title: $('welcomeTitle').value.trim(), description: $('welcomeDescription').value.trim(), color: $('welcomeColor').value, footer: $('welcomeFooter').value.trim(), imageUrl: $('welcomeImageUrl').value.trim() };
    state.welcome.leaveMessage = { enabled: $('leaveEnabled').checked, channelId: $('leaveChannelId').value.trim(), title: $('leaveTitle').value.trim(), description: $('leaveDescription').value.trim(), color: $('leaveColor').value };
    state.welcome.suspicious = { minAccountAgeDays: Number($('minAccountAgeDays').value), maxSimilarityDistance: Number($('maxSimilarityDistance').value), checkImpersonation: $('checkImpersonation').checked, protectedUsers: $('protectedUsers').value.split('\n').map(name => name.trim()).filter(Boolean).map(name => ({ name })), blockedKeywords: $('blockedKeywords').value.split('\n').map(word => word.trim()).filter(Boolean) };
    state.welcome.autoMod = { enabled: $('autoModEnabled').checked, filterInvites: $('autoModInvites').checked, maxMentions: Number($('autoModMaxMentions').value), messageLimit: Number($('autoModMessageLimit').value), timeoutMinutes: Number($('autoModTimeout').value), exemptRoleIds: [...$('autoModExemptRoles').selectedOptions].map(option => option.value) };
    save('welcomeNote', { tickets: state.tickets, welcome: state.welcome });
  });
  ['ticketTitle', 'ticketDescription', 'ticketFooter'].forEach(id => $(id).addEventListener('input', previewTickets));
  ['welcomeTitle', 'welcomeDescription', 'welcomeColor', 'welcomeFooter', 'welcomeImageUrl'].forEach(id => $(id).addEventListener('input', () => { previewWelcome(); setPreviewScreen('welcome'); }));
  ['announcementType', 'announcementColor', 'announcementTitle', 'announcementDescription', 'announcementEventAt', 'announcementSchedule', 'announcementButtonLabel', 'announcementButtonUrl', 'announcementThumbnailUrl', 'announcementFooter'].forEach(id => {
    const updatePreview = () => { previewAnnouncement(); setPreviewScreen('announcement'); };
    $(id).addEventListener('input', updatePreview);
    $(id).addEventListener('change', updatePreview);
  });
  $('announcementImage').addEventListener('change', chooseAnnouncementImage);
  $('removeAnnouncementImage').addEventListener('click', clearAnnouncementImage);
  $('sendAnnouncement').addEventListener('click', submitAnnouncement);
  $('saveAnnouncementDraft').addEventListener('click', () => submitAnnouncement(true));
  $('refreshAnnouncements').addEventListener('click', refreshAnnouncements);
  $('refreshTickets').addEventListener('click', refreshTickets);
  $('ticketStatusFilter').addEventListener('change', refreshTickets);
  let ticketSearchTimer;
  $('ticketSearch').addEventListener('input', () => { clearTimeout(ticketSearchTimer); ticketSearchTimer = setTimeout(refreshTickets, 250); });
  $('refreshBotStatus').addEventListener('click', refreshBotStatus);
  $('refreshModeration').addEventListener('click', refreshModeration);
  $('refreshActivity').addEventListener('click', refreshActivity);
  $('savePermissions').addEventListener('click', savePanelPermissions);
  document.querySelectorAll('[data-preview-screen]').forEach(button => button.addEventListener('click', () => setPreviewScreen(button.dataset.previewScreen)));
  setInterval(() => {
    if (!state.welcome) return;
    if ($('pane-welcome').classList.contains('active')) { refreshAnnouncements(); refreshModeration(); refreshBotStatus(); }
    if ($('pane-tickets').classList.contains('active')) refreshTickets();
    if ($('pane-activity').classList.contains('active')) refreshActivity();
  }, 15_000);
  load();
})();
