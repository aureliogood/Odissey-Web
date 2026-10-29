// Conector local del panel de bots. Solo escucha en loopback y autoriza
// cada petición consultando la sesión de Supabase y el rol admin.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.ODISSEY_BOT_PANEL_PORT) || 32170;
const ORIGIN = 'https://odisseymc.site';
const BASE = path.resolve(__dirname, '..');
const TICKETS_DIR = path.resolve(process.env.ODISSEY_TICKETS_DIR || path.join(BASE, 'Bot-Tickets'));
const WELCOME_DIR = path.resolve(process.env.ODISSEY_WELCOME_DIR || path.join(BASE, 'Bot-Welcome'));
const SITE_CONFIG = path.join(__dirname, 'site-config.js');

function siteKeys() {
  const src = fs.readFileSync(SITE_CONFIG, 'utf8');
  const url = src.match(/supabaseUrl:\s*'([^']+)'/);
  const key = src.match(/supabaseKey:\s*'([^']+)'/);
  if (!url || !key) throw new Error('No se pudo leer la configuración pública de Supabase.');
  return { url: url[1].replace(/\/$/, ''), key: key[1] };
}

function json(res, status, data) {
  const raw = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(raw);
}

function cors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = origin === ORIGIN || origin === 'http://127.0.0.1:5500' || origin === 'http://localhost:5500';
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  return allowed;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 200_000) { reject(new Error('body_too_large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

async function requireAdmin(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const { url, key } = siteKeys();
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  const userRes = await fetch(`${url}/auth/v1/user`, { headers });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  if (!user || !user.id) return false;
  const profileRes = await fetch(`${url}/rest/v1/profiles?select=rol&id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers });
  if (!profileRes.ok) return false;
  const rows = await profileRes.json();
  return Array.isArray(rows) && rows[0] && rows[0].rol === 'admin';
}

function readConfig(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
}

function safeTickets(cfg) {
  return {
    guildId: cfg.guildId || '',
    supportRoleId: cfg.supportRoleId || '',
    logsChannelId: cfg.logsChannelId || '',
    panel: {
      title: cfg.panel?.title || '🏛️ CENTRO DE SOPORTE — ODISSEY MC',
      description: cfg.panel?.description || 'Elige el motivo que mejor se adapte a tu necesidad y pulsa **Abrir**.\nSe creará un canal privado donde podrás comunicarte directamente con el Staff.',
      footer: cfg.panel?.footer || 'Odissey MC • Solo tú y el equipo de Staff pueden ver este canal.',
    },
    categories: Array.isArray(cfg.categories) ? cfg.categories.map(c => ({
      id: c.id || '', label: c.label || '', emoji: c.emoji || '', description: c.description || '',
      categoryId: c.categoryId || '', color: c.color || '#FFAA00', buttonLabel: c.buttonLabel || 'Abrir',
    })) : [],
  };
}

function safeWelcome(cfg) {
  return {
    guildId: cfg.guildId || '', welcomeChannelId: cfg.welcomeChannelId || '',
    alertsChannelId: cfg.alertsChannelId || '', staffRoleId: cfg.staffRoleId || '',
    announcementChannelId: cfg.announcementChannelId || '',
    autoMod: {
      enabled: cfg.autoMod?.enabled === true,
      filterInvites: cfg.autoMod?.filterInvites !== false,
      maxMentions: Number(cfg.autoMod?.maxMentions ?? 5),
      messageLimit: Number(cfg.autoMod?.messageLimit ?? 7),
      timeoutMinutes: Number(cfg.autoMod?.timeoutMinutes ?? 10),
      exemptRoleIds: Array.isArray(cfg.autoMod?.exemptRoleIds) ? cfg.autoMod.exemptRoleIds.map(String) : [],
    },
    welcomeMessage: {
      title: cfg.welcomeMessage?.title || '🐨 ¡Bienvenido a ODISSEY MC!',
      description: cfg.welcomeMessage?.description || '¡Hola {usuario}! 💛\nBienvenido a nuestra comunidad. Lee las reglas, pásate por los canales y ¡que la pases genial! 🎉',
      color: cfg.welcomeMessage?.color || '#FFAA00',
      footer: cfg.welcomeMessage?.footer || 'Odissey MC • 🐨💛',
    },
    suspicious: {
      minAccountAgeDays: Number(cfg.suspicious?.minAccountAgeDays ?? 7),
      checkImpersonation: cfg.suspicious?.checkImpersonation !== false,
      maxSimilarityDistance: Number(cfg.suspicious?.maxSimilarityDistance ?? 2),
      protectedUsers: Array.isArray(cfg.suspicious?.protectedUsers) ? cfg.suspicious.protectedUsers.map(x => ({ name: String(x.name || ''), id: String(x.id || '') })) : [],
      blockedKeywords: Array.isArray(cfg.suspicious?.blockedKeywords) ? cfg.suspicious.blockedKeywords.map(String) : [],
    },
    status: { host: cfg.status?.host || '', port: Number(cfg.status?.port || 25565), channelId: cfg.status?.channelId || '', maintenance: !!cfg.status?.maintenance },
  };
}

function validId(v) { return v === '' || /^\d{5,25}$/.test(String(v)); }
function boundedText(v, max, name) {
  if (typeof v !== 'string' || v.length > max) throw new Error(`invalid_${name}`);
  return v.trim();
}
function saveConfig(dir, config) {
  const file = path.join(dir, 'config.json');
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, file);
}

function mergeSubmitted(ticketCfg, welcomeCfg, input) {
  const t = input.tickets || {};
  const w = input.welcome || {};
  if (!Array.isArray(t.categories) || t.categories.length < 1 || t.categories.length > 5) throw new Error('categories_count');
  const seenIds = new Set();
  const categories = t.categories.map((c, i) => {
    const id = boundedText(String(c.id || ''), 32, `category_${i}_id`);
    if (!/^[a-z0-9_-]+$/i.test(id)) throw new Error('category_id');
    if (seenIds.has(id)) throw new Error('category_id_duplicate');
    seenIds.add(id);
    if (!validId(c.categoryId)) throw new Error('category_channel_id');
    const color = /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? String(c.color).toUpperCase() : '#FFAA00';
    return { id, label: boundedText(String(c.label || ''), 80, 'category_label'), emoji: boundedText(String(c.emoji || ''), 24, 'category_emoji'), description: boundedText(String(c.description || ''), 350, 'category_description'), categoryId: String(c.categoryId || ''), color, buttonLabel: boundedText(String(c.buttonLabel || ''), 32, 'button_label') || 'Abrir' };
  });
  const ticketNext = { ...ticketCfg, supportRoleId: String(t.supportRoleId || ''), logsChannelId: String(t.logsChannelId || ''), panel: {
    ...(ticketCfg.panel || {}), title: boundedText(String(t.panel?.title || ''), 100, 'panel_title'),
    description: boundedText(String(t.panel?.description || ''), 1000, 'panel_description'),
    footer: boundedText(String(t.panel?.footer || ''), 200, 'panel_footer'),
  }, categories };
  if (!validId(ticketNext.supportRoleId) || !validId(ticketNext.logsChannelId)) throw new Error('ticket_discord_id');

  const suspicious = w.suspicious || {};
  const welcomeMessage = w.welcomeMessage || {};
  const autoMod = w.autoMod || {};
  const welcomeNext = { ...welcomeCfg, welcomeChannelId: String(w.welcomeChannelId || ''), alertsChannelId: String(w.alertsChannelId || ''), staffRoleId: String(w.staffRoleId || ''), announcementChannelId: String(w.announcementChannelId || ''),
    welcomeMessage: { ...(welcomeCfg.welcomeMessage || {}), title: boundedText(String(welcomeMessage.title || ''), 256, 'welcome_title'), description: boundedText(String(welcomeMessage.description || ''), 1500, 'welcome_description'), footer: boundedText(String(welcomeMessage.footer || ''), 200, 'welcome_footer'), color: /^#[0-9a-f]{6}$/i.test(String(welcomeMessage.color || '')) ? String(welcomeMessage.color).toUpperCase() : '#FFAA00' },
    suspicious: { ...(welcomeCfg.suspicious || {}), minAccountAgeDays: Math.max(0, Math.min(3650, Number(suspicious.minAccountAgeDays) || 0)), checkImpersonation: !!suspicious.checkImpersonation, maxSimilarityDistance: Math.max(0, Math.min(8, Number(suspicious.maxSimilarityDistance) || 0)), protectedUsers: Array.isArray(suspicious.protectedUsers) ? suspicious.protectedUsers.slice(0, 100).map(x => ({ name: boundedText(String(x.name || ''), 80, 'protected_name'), id: String(x.id || '') })) : [], blockedKeywords: Array.isArray(suspicious.blockedKeywords) ? suspicious.blockedKeywords.slice(0, 100).map(x => boundedText(String(x), 40, 'keyword')).filter(Boolean) : [] },
    autoMod: { ...(welcomeCfg.autoMod || {}), enabled: autoMod.enabled === true, filterInvites: autoMod.filterInvites !== false, maxMentions: Math.max(0, Math.min(20, Number(autoMod.maxMentions) || 0)), messageLimit: Math.max(3, Math.min(30, Number(autoMod.messageLimit) || 7)), timeoutMinutes: Math.max(0, Math.min(1440, Number(autoMod.timeoutMinutes) || 0)), exemptRoleIds: Array.isArray(autoMod.exemptRoleIds) ? autoMod.exemptRoleIds.slice(0, 50).map(String) : [] },
    status: { ...(welcomeCfg.status || {}), host: boundedText(String(w.status?.host || ''), 253, 'status_host'), port: Number(w.status?.port), channelId: String(w.status?.channelId || ''), maintenance: !!w.status?.maintenance },
  };
  for (const id of [welcomeNext.welcomeChannelId, welcomeNext.alertsChannelId, welcomeNext.staffRoleId, welcomeNext.announcementChannelId]) if (!validId(id)) throw new Error('welcome_discord_id');
  if (welcomeNext.autoMod.exemptRoleIds.some(id => !/^\d{5,25}$/.test(id))) throw new Error('automod_role_id');
  if (!/^[a-z0-9.-]+$/i.test(welcomeNext.status.host) || !validId(welcomeNext.status.channelId) || !Number.isInteger(welcomeNext.status.port) || welcomeNext.status.port < 1 || welcomeNext.status.port > 65535) throw new Error('welcome_status');
  return { ticketNext, welcomeNext };
}

const ANNOUNCEMENTS_DIR = path.join(WELCOME_DIR, 'announcements');
const announcementRate = new Map();

function readAnnouncements() {
  fs.mkdirSync(ANNOUNCEMENTS_DIR, { recursive: true, mode: 0o700 });
  return fs.readdirSync(ANNOUNCEMENTS_DIR)
    .filter(name => /^[a-f0-9-]{36}\.json$/i.test(name))
    .map(name => {
      try { return JSON.parse(fs.readFileSync(path.join(ANNOUNCEMENTS_DIR, name), 'utf8')); }
      catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 20)
    .map(item => ({ id: item.id, type: item.type, title: item.title, channelId: item.channelId,
      scheduledAt: item.scheduledAt || '', status: item.status, createdAt: item.createdAt,
      sentAt: item.sentAt || '', discordMessageId: item.discordMessageId || '', error: item.error || '' }));
}

function createAnnouncement(input, cfg) {
  const title = boundedText(String(input.title || ''), 180, 'announcement_title');
  const description = boundedText(String(input.description || ''), 3000, 'announcement_description');
  if (!title || !description) throw new Error('announcement_required');
  const channelId = String(input.channelId || cfg.announcementChannelId || '');
  if (!/^\d{5,25}$/.test(channelId)) throw new Error('announcement_channel_required');
  const type = input.type === 'event' ? 'event' : 'announcement';
  const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color).toUpperCase() : '#FFAA00';
  let scheduledAt = '';
  if (input.scheduledAt) {
    const time = Date.parse(input.scheduledAt);
    if (!Number.isFinite(time) || time < Date.now() - 60_000 || time > Date.now() + 366 * 86_400_000) throw new Error('announcement_schedule_invalid');
    scheduledAt = new Date(time).toISOString();
  }
  const id = crypto.randomUUID();
  const job = { id, guildId: String(cfg.guildId || ''), channelId, type, title, description, color,
    eventAt: type === 'event' ? boundedText(String(input.eventAt || ''), 100, 'event_date') : '',
    scheduledAt, status: 'pending', createdAt: new Date().toISOString() };
  fs.mkdirSync(ANNOUNCEMENTS_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(ANNOUNCEMENTS_DIR, `${id}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(job, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, file);
  return job;
}

const server = http.createServer(async (req, res) => {
  const allowed = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); return res.end(); }
  if (!allowed) return json(res, 403, { ok: false, error: 'origin_denied' });
  if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'odissey-bot-panel' });
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  if (!(
    (route === '/api/config' && ['GET', 'PUT'].includes(req.method)) ||
    (route === '/api/announcements' && ['GET', 'POST'].includes(req.method))
  )) return json(res, 404, { ok: false, error: 'not_found' });
  try {
    if (!(await requireAdmin(req))) return json(res, 403, { ok: false, error: 'admin_required' });
    if (route === '/api/announcements' && req.method === 'GET') return json(res, 200, { ok: true, announcements: readAnnouncements() });
    if (route === '/api/announcements' && req.method === 'POST') {
      const input = await readBody(req);
      const who = crypto.createHash('sha256').update(String(req.headers.authorization || '').slice(7)).digest('hex');
      const now = Date.now();
      if (now - (announcementRate.get(who) || 0) < 20_000) return json(res, 429, { ok: false, error: 'announcement_rate_limited' });
      const job = createAnnouncement(input, readConfig(WELCOME_DIR));
      announcementRate.set(who, now);
      return json(res, 202, { ok: true, announcement: { id: job.id, status: job.status, scheduledAt: job.scheduledAt } });
    }
    if (req.method === 'GET') return json(res, 200, { ok: true, tickets: safeTickets(readConfig(TICKETS_DIR)), welcome: safeWelcome(readConfig(WELCOME_DIR)) });
    const input = await readBody(req);
    const ticketCfg = readConfig(TICKETS_DIR);
    const welcomeCfg = readConfig(WELCOME_DIR);
    const next = mergeSubmitted(ticketCfg, welcomeCfg, input);
    saveConfig(TICKETS_DIR, next.ticketNext);
    saveConfig(WELCOME_DIR, next.welcomeNext);
    return json(res, 200, { ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[BOT-PANEL]', err.message);
    return json(res, 400, { ok: false, error: err.message || 'bad_request' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[BOT-PANEL] Conector local en http://127.0.0.1:${PORT}`);
  console.log(`[BOT-PANEL] Carpetas: ${TICKETS_DIR} | ${WELCOME_DIR}`);
});
