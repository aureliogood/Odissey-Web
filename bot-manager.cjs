// Conector local del panel de bots. Solo escucha en loopback y autoriza
// cada petición consultando la sesión de Supabase y el rol admin.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.ODISSEY_BOT_PANEL_PORT) || 32170;
const ORIGIN = 'https://odisseymc.site';
const BASE = path.resolve(__dirname, '..');
const TICKETS_DIR = path.resolve(process.env.ODISSEY_TICKETS_DIR || path.join(BASE, 'Bot-Tickets'));
const WELCOME_DIR = path.resolve(process.env.ODISSEY_WELCOME_DIR || path.join(BASE, 'Bot-Welcome'));
const SITE_CONFIG = path.join(__dirname, 'site-config.js');
const PANEL_DATA_DIR = path.join(WELCOME_DIR, 'panel-data');
const PANEL_ACCESS_FILE = path.join(PANEL_DATA_DIR, 'access.json');
const VERSION_DIR = path.join(PANEL_DATA_DIR, 'versions');
const AUDIT_FILE = path.join(PANEL_DATA_DIR, 'audit.json');
const PANEL_PERMISSIONS = ['config:read', 'config:write', 'tickets:read', 'tickets:close', 'tickets:reopen', 'announcements:read', 'announcements:write', 'moderation:read', 'analytics:read', 'alerts:read', 'botstatus:read'];

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  return allowed;
}

function readBody(req, maxBytes = 200_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > maxBytes) { reject(new Error('body_too_large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

async function sessionActor(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { url, key } = siteKeys();
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  const userRes = await fetch(`${url}/auth/v1/user`, { headers });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user || !user.id) return null;
  const profileRes = await fetch(`${url}/rest/v1/profiles?select=rol&id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers });
  if (!profileRes.ok) return null;
  const rows = await profileRes.json();
  if (!Array.isArray(rows) || !rows[0] || !['staff', 'admin'].includes(rows[0].rol)) return null;
  return { id: String(user.id), email: String(user.email || ''), role: rows[0].rol };
}

function readPanelAccess() {
  try {
    const data = JSON.parse(fs.readFileSync(PANEL_ACCESS_FILE, 'utf8'));
    return { staff: Array.isArray(data.staff) ? data.staff.filter(p => PANEL_PERMISSIONS.includes(p)) : [] };
  } catch { return { staff: ['tickets:read', 'announcements:read', 'moderation:read', 'analytics:read', 'alerts:read', 'botstatus:read'] }; }
}

function actorCan(actor, permission) {
  if (actor.role === 'admin') return true;
  const grants = readPanelAccess().staff;
  if (grants.includes(permission)) return true;
  if (permission === 'config:read' && grants.includes('config:write')) return true;
  if (permission === 'tickets:read' && (grants.includes('tickets:close') || grants.includes('tickets:reopen'))) return true;
  if (permission === 'announcements:read' && grants.includes('announcements:write')) return true;
  return false;
}

function actorPermissions(actor) {
  return PANEL_PERMISSIONS.filter(permission => actorCan(actor, permission));
}

function readAudit() {
  try { const rows = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')); return Array.isArray(rows) ? rows.slice(-100).reverse() : []; }
  catch { return []; }
}

function requirePermission(actor, permission) {
  if (!actorCan(actor, permission)) throw new Error('permission_denied');
}

function appendAudit(actor, action, details = {}) {
  fs.mkdirSync(PANEL_DATA_DIR, { recursive: true, mode: 0o700 });
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8')); if (!Array.isArray(rows)) rows = []; } catch {}
  rows.push({ id: crypto.randomUUID(), at: new Date().toISOString(), actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, action, details });
  const temp = `${AUDIT_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(rows.slice(-500), null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, AUDIT_FILE);
}

function saveConfigVersion(actor, tickets, welcome, note) {
  fs.mkdirSync(VERSION_DIR, { recursive: true, mode: 0o700 });
  const version = { id: crypto.randomUUID(), at: new Date().toISOString(), actorId: actor.id, actorEmail: actor.email, note, tickets: safeTickets(tickets), welcome: safeWelcome(welcome) };
  fs.writeFileSync(path.join(VERSION_DIR, `${version.id}.json`), JSON.stringify(version, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  const files = fs.readdirSync(VERSION_DIR).filter(name => /^[a-f0-9-]{36}\.json$/i.test(name)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - 50))) fs.rmSync(path.join(VERSION_DIR, old), { force: true });
  return version;
}

function listConfigVersions() {
  fs.mkdirSync(VERSION_DIR, { recursive: true, mode: 0o700 });
  return fs.readdirSync(VERSION_DIR).filter(name => /^[a-f0-9-]{36}\.json$/i.test(name)).map(name => {
    try { const v = JSON.parse(fs.readFileSync(path.join(VERSION_DIR, name), 'utf8')); return { id: v.id, at: v.at, actorEmail: v.actorEmail, note: v.note }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => String(b.at).localeCompare(String(a.at)));
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
      imageUrl: cfg.welcomeMessage?.imageUrl || '',
    },
    leaveMessage: {
      enabled: cfg.leaveMessage?.enabled === true,
      channelId: cfg.leaveMessage?.channelId || '',
      title: cfg.leaveMessage?.title || 'Hasta pronto, {usuario}',
      description: cfg.leaveMessage?.description || '{usuario} salió de {servidor}. Ahora somos {miembros} miembros.',
      color: cfg.leaveMessage?.color || '#667085',
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
    welcomeMessage: { ...(welcomeCfg.welcomeMessage || {}), title: boundedText(String(welcomeMessage.title || ''), 256, 'welcome_title'), description: boundedText(String(welcomeMessage.description || ''), 1500, 'welcome_description'), footer: boundedText(String(welcomeMessage.footer || ''), 200, 'welcome_footer'), color: /^#[0-9a-f]{6}$/i.test(String(welcomeMessage.color || '')) ? String(welcomeMessage.color).toUpperCase() : '#FFAA00', imageUrl: safeHttpsUrl(welcomeMessage.imageUrl, 'welcome_image_url') },
    leaveMessage: { ...(welcomeCfg.leaveMessage || {}), enabled: w.leaveMessage?.enabled === true, channelId: String(w.leaveMessage?.channelId || ''), title: boundedText(String(w.leaveMessage?.title || ''), 256, 'leave_title'), description: boundedText(String(w.leaveMessage?.description || ''), 1500, 'leave_description'), color: /^#[0-9a-f]{6}$/i.test(String(w.leaveMessage?.color || '')) ? String(w.leaveMessage.color).toUpperCase() : '#667085' },
    suspicious: { ...(welcomeCfg.suspicious || {}), minAccountAgeDays: Math.max(0, Math.min(3650, Number(suspicious.minAccountAgeDays) || 0)), checkImpersonation: !!suspicious.checkImpersonation, maxSimilarityDistance: Math.max(0, Math.min(8, Number(suspicious.maxSimilarityDistance) || 0)), protectedUsers: Array.isArray(suspicious.protectedUsers) ? suspicious.protectedUsers.slice(0, 100).map(x => ({ name: boundedText(String(x.name || ''), 80, 'protected_name'), id: String(x.id || '') })) : [], blockedKeywords: Array.isArray(suspicious.blockedKeywords) ? suspicious.blockedKeywords.slice(0, 100).map(x => boundedText(String(x), 40, 'keyword')).filter(Boolean) : [] },
    autoMod: { ...(welcomeCfg.autoMod || {}), enabled: autoMod.enabled === true, filterInvites: autoMod.filterInvites !== false, maxMentions: Math.max(0, Math.min(20, Number(autoMod.maxMentions) || 0)), messageLimit: Math.max(3, Math.min(30, Number(autoMod.messageLimit) || 7)), timeoutMinutes: Math.max(0, Math.min(1440, Number(autoMod.timeoutMinutes) || 0)), exemptRoleIds: Array.isArray(autoMod.exemptRoleIds) ? autoMod.exemptRoleIds.slice(0, 50).map(String) : [] },
    status: { ...(welcomeCfg.status || {}), host: boundedText(String(w.status?.host || ''), 253, 'status_host'), port: Number(w.status?.port), channelId: String(w.status?.channelId || ''), maintenance: !!w.status?.maintenance },
  };
  for (const id of [welcomeNext.welcomeChannelId, welcomeNext.alertsChannelId, welcomeNext.staffRoleId, welcomeNext.announcementChannelId, welcomeNext.leaveMessage.channelId]) if (!validId(id)) throw new Error('welcome_discord_id');
  if (welcomeNext.autoMod.exemptRoleIds.some(id => !/^\d{5,25}$/.test(id))) throw new Error('automod_role_id');
  if (!/^[a-z0-9.-]+$/i.test(welcomeNext.status.host) || !validId(welcomeNext.status.channelId) || !Number.isInteger(welcomeNext.status.port) || welcomeNext.status.port < 1 || welcomeNext.status.port > 65535) throw new Error('welcome_status');
  return { ticketNext, welcomeNext };
}

function safeHttpsUrl(value, errorCode) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > 500) throw new Error(`invalid_${errorCode}`);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`invalid_${errorCode}`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`invalid_${errorCode}`);
  return url.toString();
}

function readBotStatus(dir) {
  try {
    const item = JSON.parse(fs.readFileSync(path.join(dir, 'bot-status.json'), 'utf8'));
    return { online: Date.now() - Number(item.heartbeatAt || 0) < 90_000, heartbeatAt: item.heartbeatAt || 0, tag: String(item.tag || '') };
  } catch { return { online: false, heartbeatAt: 0, tag: '' }; }
}

async function discordContext(cfg) {
  const token = String(cfg.token || '');
  const guildId = String(cfg.guildId || '');
  if (!token || !/^\d{5,25}$/.test(guildId)) throw new Error('discord_directory_unavailable');
  const headers = { Authorization: `Bot ${token}`, 'User-Agent': 'OdisseyBotPanel/1.0' };
  const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers });
  if (!meRes.ok) throw new Error('discord_directory_unavailable');
  const me = await meRes.json();
  const [channelsRes, rolesRes, memberRes, guildRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, { headers }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${me.id}`, { headers }),
    fetch(`https://discord.com/api/v10/guilds/${guildId}`, { headers }),
  ]);
  if (!channelsRes.ok || !rolesRes.ok || !memberRes.ok || !guildRes.ok) throw new Error('discord_directory_unavailable');
  const [channels, roles, member, guild] = await Promise.all([channelsRes.json(), rolesRes.json(), memberRes.json(), guildRes.json()]);
  return { guildId, token, botId: me.id, ownerId: guild.owner_id, channels, roles, member };
}

async function discordDirectory() {
  const cfg = readConfig(WELCOME_DIR); const context = await discordContext(cfg);
  return {
    channels: context.channels.filter(c => [0, 5, 15].includes(c.type)).map(c => ({ id: c.id, name: c.name, type: c.type })),
    categories: context.channels.filter(c => c.type === 4).map(c => ({ id: c.id, name: c.name })),
    roles: context.roles.filter(r => !r.managed && r.name !== '@everyone').map(r => ({ id: r.id, name: r.name })),
  };
}

function channelPermissions(context, channel) {
  const guildId = context.guildId;
  if (context.ownerId === context.botId) return (1n << 64n) - 1n;
  const memberRoleIds = new Set([guildId, ...(context.member.roles || []).map(String)]);
  let permissions = context.roles.filter(role => memberRoleIds.has(role.id)).reduce((bits, role) => bits | BigInt(role.permissions || '0'), 0n);
  const administrator = 8n;
  if ((permissions & administrator) !== 0n) return (1n << 64n) - 1n;
  const overwrites = channel.permission_overwrites || [];
  const everyone = overwrites.find(item => String(item.id) === guildId && String(item.type) === '0');
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny || '0')) | BigInt(everyone.allow || '0');
  let roleDeny = 0n, roleAllow = 0n;
  for (const overwrite of overwrites) if (String(overwrite.type) === '0' && memberRoleIds.has(String(overwrite.id)) && String(overwrite.id) !== guildId) {
    roleDeny |= BigInt(overwrite.deny || '0'); roleAllow |= BigInt(overwrite.allow || '0');
  }
  permissions = (permissions & ~roleDeny) | roleAllow;
  const member = overwrites.find(item => String(item.type) === '1' && String(item.id) === context.botId);
  if (member) permissions = (permissions & ~BigInt(member.deny || '0')) | BigInt(member.allow || '0');
  return permissions;
}

async function checkDiscordConfig(ticketCfg, welcomeCfg) {
  const [tickets, welcome] = await Promise.all([discordContext(ticketCfg), discordContext(welcomeCfg)]);
  const issues = [];
  const permNames = [[1024n, 'Ver canal'], [2048n, 'Enviar mensajes']];
  const checkChannel = (context, channelId, label, required, types = [0, 5, 15]) => {
    if (!channelId) return;
    const channel = context.channels.find(c => c.id === String(channelId));
    if (!channel) { issues.push({ label, bot: context === tickets ? 'tickets' : 'welcome', missing: ['El canal no existe o el bot no puede verlo.'] }); return; }
    if (!types.includes(channel.type)) { issues.push({ label, bot: context === tickets ? 'tickets' : 'welcome', missing: ['El tipo de canal no es compatible.'] }); return; }
    const bits = channelPermissions(context, channel);
    const missing = required.filter(([bit]) => (bits & bit) !== bit).map(([, name]) => name);
    if (missing.length) issues.push({ label, bot: context === tickets ? 'tickets' : 'welcome', missing });
  };
  const basic = permNames;
  checkChannel(tickets, ticketCfg.logsChannelId, 'Canal de transcripts', [...basic, [16384n, 'Insertar embeds'], [32768n, 'Adjuntar transcripts'], [65536n, 'Leer historial']]);
  for (const c of ticketCfg.categories || []) if (c.categoryId) checkChannel(tickets, c.categoryId, `Categoría ${c.label || c.id}`, [[16n, 'Gestionar canales']], [4]);
  checkChannel(welcome, welcomeCfg.welcomeChannelId, 'Bienvenidas', [...basic, ...(welcomeCfg.welcomeMessage?.imageUrl ? [[16384n, 'Insertar embeds']] : [])]);
  checkChannel(welcome, welcomeCfg.alertsChannelId, 'Alertas de staff', [...basic, [16384n, 'Insertar embeds']]);
  checkChannel(welcome, welcomeCfg.announcementChannelId, 'Anuncios', [...basic, [16384n, 'Insertar embeds'], [32768n, 'Adjuntar archivos']]);
  checkChannel(welcome, welcomeCfg.leaveMessage?.channelId, 'Mensajes de salida', [...basic, [16384n, 'Insertar embeds']]);
  checkChannel(welcome, welcomeCfg.status?.channelId, 'Estado de Minecraft', basic);
  for (const id of [ticketCfg.supportRoleId, welcomeCfg.staffRoleId, ...(welcomeCfg.autoMod?.exemptRoleIds || [])].filter(Boolean)) {
    if (![...tickets.roles, ...welcome.roles].some(role => role.id === String(id))) issues.push({ label: `Rol ${id}`, bot: 'Discord', missing: ['El rol no existe o no es visible para los bots.'] });
  }
  return issues;
}

function readOpenTickets(status = 'open', query = '') {
  const file = path.join(TICKETS_DIR, 'tickets.db');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const guildId = String(readConfig(TICKETS_DIR).guildId || '');
    const search = `%${String(query).replace(/[\\%_]/g, '')}%`;
    const statusClause = status === 'all' ? "status IN ('open','closed')" : 'status = ?';
    const sql = `SELECT guild_id AS guildId, id, channel_id AS channelId, user_id AS userId, category, status, claimed_by AS claimedBy, created_at AS createdAt FROM tickets WHERE guild_id = ? AND ${statusClause} AND (? = '' OR CAST(id AS TEXT) LIKE ? OR user_id LIKE ? OR category LIKE ?) ORDER BY created_at DESC LIMIT 100`;
    return status === 'all'
      ? db.prepare(sql).all(guildId, String(query), search, search, search)
      : db.prepare(sql).all(guildId, status, String(query), search, search, search);
  } finally { db.close(); }
}

function readModerationLog() {
  try {
    return JSON.parse(fs.readFileSync(path.join(WELCOME_DIR, 'moderation-log.json'), 'utf8')).slice(-30).reverse();
  } catch { return []; }
}

function readAnalytics() {
  const now = Date.now(), since = now - 30 * 86_400_000;
  const ticketsDb = new DatabaseSync(path.join(TICKETS_DIR, 'tickets.db'), { readOnly: true });
  let tickets;
  try {
    const guildId = String(readConfig(TICKETS_DIR).guildId || '');
    tickets = {
      total: ticketsDb.prepare('SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ?').get(guildId).n,
      open: ticketsDb.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND status = 'open'").get(guildId).n,
      closed: ticketsDb.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND status = 'closed'").get(guildId).n,
      recent: ticketsDb.prepare('SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND created_at >= ?').get(guildId, since).n,
      categories: ticketsDb.prepare('SELECT category AS name, COUNT(*) AS count FROM tickets WHERE guild_id = ? GROUP BY category ORDER BY count DESC LIMIT 10').all(guildId),
      daily: ticketsDb.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS date, COUNT(*) AS count FROM tickets WHERE guild_id = ? AND created_at >= ? GROUP BY date").all(guildId, since),
    };
  } finally { ticketsDb.close(); }
  let joins = { total: 0, recent: 0 };
  try {
    const welcomeDb = new DatabaseSync(path.join(WELCOME_DIR, 'welcome.db'), { readOnly: true });
    try {
      const guild = String(readConfig(WELCOME_DIR).guildId || '');
      joins = {
        total: welcomeDb.prepare('SELECT COUNT(*) AS n FROM joins WHERE guild_id = ?').get(guild).n,
        recent: welcomeDb.prepare('SELECT COUNT(*) AS n FROM joins WHERE guild_id = ? AND first_join >= ?').get(guild, since).n,
      };
    } finally { welcomeDb.close(); }
  } catch {}
  const activity = (() => { try { return JSON.parse(fs.readFileSync(path.join(WELCOME_DIR, 'activity-log.json'), 'utf8')); } catch { return []; } })();
  const days = new Map();
  for (let offset = 29; offset >= 0; offset--) {
    const day = new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
    days.set(day, { date: day, joins: 0, leaves: 0, tickets: 0 });
  }
  for (const item of activity) { const bucket = days.get(String(item.at || '').slice(0, 10)); if (bucket && item.type === 'join') bucket.joins++; if (bucket && item.type === 'leave') bucket.leaves++; }
  for (const item of tickets.daily) { const bucket = days.get(item.date); if (bucket) bucket.tickets = item.count; }
  return { tickets, joins, moderation: readModerationLog().length, members: [...days.values()] };
}

function collectAlerts() {
  const alerts = [];
  for (const [key, dir, label] of [['tickets', TICKETS_DIR, 'Tickets'], ['welcome', WELCOME_DIR, 'Bot global']]) {
    const status = readBotStatus(dir);
    if (!status.online) alerts.push({ id: `bot-${key}`, at: status.heartbeatAt ? new Date(status.heartbeatAt).toISOString() : new Date().toISOString(), level: 'error', title: `${label} sin señal`, description: status.heartbeatAt ? 'No registra heartbeat reciente.' : 'Todavía no ha escrito su primer heartbeat.' });
  }
  for (const item of readAnnouncements().filter(a => a.status === 'failed')) alerts.push({ id: `announcement-${item.id}`, at: item.createdAt, level: 'error', title: `Falló el anuncio: ${item.title}`, description: item.error || 'Discord no pudo publicarlo.' });
  try {
    const dir = path.join(TICKETS_DIR, 'panel-commands');
    for (const name of fs.readdirSync(dir).filter(n => /^[a-f0-9-]{36}\.json$/i.test(n))) {
      const cmd = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (cmd.status === 'failed') alerts.push({ id: `ticket-${cmd.id}`, at: cmd.completedAt || cmd.requestedAt, level: 'error', title: `No se pudo cerrar el ticket #${cmd.ticketId}`, description: cmd.error || 'Error de Discord.' });
    }
  } catch {}
  return alerts.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50);
}

let monitoringAlerts = false;
async function sendDiscordAlert(message) {
  const cfg = readConfig(WELCOME_DIR);
  if (!cfg.token || !/^\d{5,25}$/.test(String(cfg.alertsChannelId || ''))) return false;
  const response = await fetch(`https://discord.com/api/v10/channels/${cfg.alertsChannelId}/messages`, {
    method: 'POST', headers: { Authorization: `Bot ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `🚨 **Alerta del panel de bots**\n${message}`, allowed_mentions: { parse: [] } }),
  });
  return response.ok;
}

async function monitorAlerts() {
  if (monitoringAlerts) return;
  monitoringAlerts = true;
  try {
    fs.mkdirSync(PANEL_DATA_DIR, { recursive: true, mode: 0o700 });
    const file = path.join(PANEL_DATA_DIR, 'alert-state.json');
    let state = {}; try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    const statuses = { tickets: readBotStatus(TICKETS_DIR), welcome: readBotStatus(WELCOME_DIR) };
    if (!state.initialized) state = { initialized: true, statuses: { tickets: statuses.tickets.online, welcome: statuses.welcome.online }, notified: [] };
    else {
      for (const [key, label] of [['tickets', 'Bot de tickets'], ['welcome', 'Bot global']]) {
        if (state.statuses?.[key] === true && statuses[key].online === false) await sendDiscordAlert(`${label} dejó de responder.`).catch(() => {});
      }
    }
    const notified = new Set(Array.isArray(state.notified) ? state.notified : []);
    for (const alert of collectAlerts()) if (alert.id.startsWith('announcement-') || alert.id.startsWith('ticket-')) {
      if (notified.has(alert.id)) continue;
      const sent = await sendDiscordAlert(`${alert.title}. ${alert.description}`).catch(() => false);
      if (sent) notified.add(alert.id);
    }
    state = { initialized: true, statuses: { tickets: statuses.tickets.online, welcome: statuses.welcome.online }, notified: [...notified].slice(-300) };
    const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(temp, file);
  } catch (err) { console.error('[ALERTAS] No se pudo revisar las alertas:', err.message); }
  finally { monitoringAlerts = false; }
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
    .map(item => ({ id: item.id, type: item.type, title: item.title, description: item.description, color: item.color, buttonUrl: item.buttonUrl || '', buttonLabel: item.buttonLabel || '', thumbnailUrl: item.thumbnailUrl || '', footer: item.footer || '', eventAt: item.eventAt || '', channelId: item.channelId,
      scheduledAt: item.scheduledAt || '', status: item.status, createdAt: item.createdAt,
      sentAt: item.sentAt || item.lastSentAt || '', discordMessageId: item.discordMessageId || '', hasImage: Boolean(item.imageFile || item.imageFiles?.length), imageCount: item.imageFiles?.length || (item.imageFile ? 1 : 0), repeatEvery: item.repeatEvery || '', error: item.error || '' }));
}

function createAnnouncement(input, cfg) {
  const title = boundedText(String(input.title || ''), 180, 'announcement_title');
  const description = boundedText(String(input.description || ''), 3000, 'announcement_description');
  if (!title || !description) throw new Error('announcement_required');
  const channelId = String(input.channelId || cfg.announcementChannelId || '');
  if (!/^\d{5,25}$/.test(channelId)) throw new Error('announcement_channel_required');
  const type = input.type === 'event' ? 'event' : 'announcement';
  const color = /^#[0-9a-f]{6}$/i.test(String(input.color || '')) ? String(input.color).toUpperCase() : '#FFAA00';
  const buttonUrl = safeHttpsUrl(input.buttonUrl, 'announcement_button_url');
  const thumbnailUrl = safeHttpsUrl(input.thumbnailUrl, 'announcement_thumbnail_url');
  const footer = boundedText(String(input.footer || 'Odissey MC · Información oficial'), 200, 'announcement_footer') || 'Odissey MC · Información oficial';
  const buttonLabel = boundedText(String(input.buttonLabel || ''), 80, 'announcement_button_label');
  if (buttonUrl && !buttonLabel) throw new Error('announcement_button_label');
  const repeatEvery = ['weekly', 'monthly'].includes(input.repeatEvery) ? input.repeatEvery : '';
  let scheduledAt = '';
  if (input.scheduledAt) {
    const time = Date.parse(input.scheduledAt);
    if (!Number.isFinite(time) || time < Date.now() - 60_000 || time > Date.now() + 366 * 86_400_000) throw new Error('announcement_schedule_invalid');
    scheduledAt = new Date(time).toISOString();
  }
  const id = crypto.randomUUID();
  const job = { id, guildId: String(cfg.guildId || ''), channelId, type, title, description, color, buttonUrl, buttonLabel, thumbnailUrl, footer, repeatEvery,
    eventAt: type === 'event' ? boundedText(String(input.eventAt || ''), 100, 'event_date') : '',
    scheduledAt, status: input.action === 'draft' ? 'draft' : 'pending', createdAt: new Date().toISOString() };
  fs.mkdirSync(ANNOUNCEMENTS_DIR, { recursive: true, mode: 0o700 });
  const imageInputs = Array.isArray(input.images) ? input.images : input.image ? [input.image] : [];
  if (imageInputs.length > 3) throw new Error('announcement_image_invalid');
  const savedImages = [];
  try {
    for (const [index, image] of imageInputs.entries()) {
      const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
      const extension = image && extensions[image.type]; const encoded = image && image.data;
      if (!extension || typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || encoded.length > Math.ceil(5 * 1024 * 1024 * 4 / 3)) throw new Error('announcement_image_invalid');
      const bytes = Buffer.from(encoded, 'base64');
      const signatures = {
        png: bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        jpg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
        gif: bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)),
        webp: bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
      };
      if (!bytes.length || bytes.length > 5 * 1024 * 1024 || !signatures[extension]) throw new Error('announcement_image_invalid');
      const filename = `${id}-${index}.${extension}`; const imagePath = path.join(ANNOUNCEMENTS_DIR, filename);
      fs.writeFileSync(imagePath, bytes, { mode: 0o600, flag: 'wx' }); savedImages.push(filename);
    }
  } catch (error) { for (const filename of savedImages) try { fs.rmSync(path.join(ANNOUNCEMENTS_DIR, filename), { force: true }); } catch {} throw error; }
  if (savedImages.length) job.imageFiles = savedImages;
  const file = path.join(ANNOUNCEMENTS_DIR, `${id}.json`);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(job, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch {}
    for (const filename of savedImages) try { fs.rmSync(path.join(ANNOUNCEMENTS_DIR, filename), { force: true }); } catch {}
    throw error;
  }
  return job;
}

const server = http.createServer(async (req, res) => {
  const allowed = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(allowed ? 204 : 403); return res.end(); }
  if (!allowed) return json(res, 403, { ok: false, error: 'origin_denied' });
  if (req.url === '/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'odissey-bot-panel' });
  const requestUrl = new URL(req.url, 'http://127.0.0.1');
  const route = requestUrl.pathname;
  if (!(
    (route === '/api/config' && ['GET', 'PUT'].includes(req.method)) ||
    (route === '/api/announcements' && ['GET', 'POST'].includes(req.method)) ||
    (/^\/api\/announcements\/[a-f0-9-]{36}\/(publish|cancel)$/i.test(route) && ['POST', 'DELETE'].includes(req.method)) ||
    (['/api/access', '/api/permissions', '/api/history', '/api/audit', '/api/analytics', '/api/alerts', '/api/directory', '/api/status', '/api/tickets', '/api/moderation'].includes(route) && req.method === 'GET') ||
    (['/api/permissions', '/api/config/check'].includes(route) && req.method === 'PUT' || route === '/api/config/check' && req.method === 'POST') ||
    (/^\/api\/history\/[a-f0-9-]{36}\/restore$/i.test(route) && req.method === 'POST') ||
    (/^\/api\/tickets\/\d+\/(close|reopen)$/.test(route) && req.method === 'POST')
  )) return json(res, 404, { ok: false, error: 'not_found' });
  try {
    const actor = await sessionActor(req);
    if (!actor) return json(res, 403, { ok: false, error: 'admin_required' });
    if (route === '/api/access') return json(res, 200, { ok: true, actor: { role: actor.role }, permissions: actorPermissions(actor), isAdmin: actor.role === 'admin' });
    if (route === '/api/permissions') {
      if (actor.role !== 'admin') return json(res, 403, { ok: false, error: 'admin_required' });
      if (req.method === 'GET') return json(res, 200, { ok: true, permissions: readPanelAccess().staff, available: PANEL_PERMISSIONS });
      const input = await readBody(req); const staff = Array.isArray(input.staff) ? [...new Set(input.staff.filter(p => PANEL_PERMISSIONS.includes(p)))].slice(0, PANEL_PERMISSIONS.length) : [];
      fs.mkdirSync(PANEL_DATA_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(PANEL_ACCESS_FILE, JSON.stringify({ staff, updatedAt: new Date().toISOString(), updatedBy: actor.email }, null, 2) + '\n', { mode: 0o600 });
      appendAudit(actor, 'permissions.updated', { role: 'staff', permissions: staff });
      return json(res, 200, { ok: true, permissions: staff });
    }
    if (route === '/api/history') { requirePermission(actor, 'config:read'); return json(res, 200, { ok: true, versions: listConfigVersions() }); }
    if (/^\/api\/history\/[a-f0-9-]{36}\/restore$/i.test(route)) {
      requirePermission(actor, 'config:write');
      const versionId = route.split('/')[3]; const versionFile = path.join(VERSION_DIR, `${versionId}.json`);
      const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      const ticketCfg = readConfig(TICKETS_DIR), welcomeCfg = readConfig(WELCOME_DIR);
      const restored = mergeSubmitted(ticketCfg, welcomeCfg, { tickets: version.tickets, welcome: version.welcome });
      const issues = await checkDiscordConfig(restored.ticketNext, restored.welcomeNext);
      if (issues.length) return json(res, 422, { ok: false, error: 'discord_permission_check_failed', issues });
      saveConfigVersion(actor, ticketCfg, welcomeCfg, 'Respaldo antes de restaurar');
      saveConfig(TICKETS_DIR, restored.ticketNext); saveConfig(WELCOME_DIR, restored.welcomeNext);
      appendAudit(actor, 'config.restored', { versionId });
      return json(res, 200, { ok: true });
    }
    if (route === '/api/audit') { if (actor.role !== 'admin') return json(res, 403, { ok: false, error: 'admin_required' }); return json(res, 200, { ok: true, entries: readAudit() }); }
    if (route === '/api/analytics') { requirePermission(actor, 'analytics:read'); return json(res, 200, { ok: true, analytics: readAnalytics() }); }
    if (route === '/api/alerts') { requirePermission(actor, 'alerts:read'); return json(res, 200, { ok: true, alerts: collectAlerts() }); }
    if (route === '/api/directory') { requirePermission(actor, 'config:read'); return json(res, 200, { ok: true, directory: await discordDirectory() }); }
    if (route === '/api/status') { requirePermission(actor, 'botstatus:read'); return json(res, 200, { ok: true, bots: { tickets: readBotStatus(TICKETS_DIR), welcome: readBotStatus(WELCOME_DIR) } }); }
    if (route === '/api/tickets' && req.method === 'GET') { requirePermission(actor, 'tickets:read'); return json(res, 200, { ok: true, tickets: readOpenTickets(requestUrl.searchParams.get('status') || 'open', requestUrl.searchParams.get('q') || '') }); }
    if (route === '/api/moderation') { requirePermission(actor, 'moderation:read'); return json(res, 200, { ok: true, events: readModerationLog() }); }
    if (/^\/api\/tickets\/\d+\/(close|reopen)$/.test(route)) {
      const commandsDir = path.join(TICKETS_DIR, 'panel-commands');
      const ticketId = Number(route.split('/')[3]); const action = route.split('/')[4];
      requirePermission(actor, action === 'close' ? 'tickets:close' : 'tickets:reopen');
      const known = readOpenTickets('all').find(ticket => Number(ticket.id) === ticketId);
      if (!known || (action === 'close' && known.status !== 'open') || (action === 'reopen' && known.status !== 'closed')) return json(res, 404, { ok: false, error: 'ticket_state_invalid' });
      fs.mkdirSync(commandsDir, { recursive: true, mode: 0o700 });
      const command = { id: crypto.randomUUID(), type: `${action}_ticket`, ticketId, status: 'pending', requestedAt: new Date().toISOString(), requestedBy: actor.email };
      fs.writeFileSync(path.join(commandsDir, `${command.id}.json`), JSON.stringify(command, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      appendAudit(actor, `ticket.${action}`, { ticketId });
      return json(res, 202, { ok: true, commandId: command.id });
    }
    if (/^\/api\/announcements\/[a-f0-9-]{36}\/(publish|cancel)$/i.test(route)) {
      requirePermission(actor, 'announcements:write');
      const [, announcementId, action] = route.match(/^\/api\/announcements\/([a-f0-9-]{36})\/(publish|cancel)$/i);
      const file = path.join(ANNOUNCEMENTS_DIR, `${announcementId}.json`);
      const job = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (action === 'cancel' && req.method === 'DELETE') {
        if (!['draft', 'pending'].includes(job.status)) return json(res, 409, { ok: false, error: 'announcement_not_cancellable' });
        fs.rmSync(file, { force: true });
        for (const image of [...(job.imageFiles || []), ...(job.imageFile ? [job.imageFile] : [])]) if (/^[a-f0-9-]{36}(?:-\d+)?\.(png|jpg|gif|webp)$/i.test(image)) fs.rmSync(path.join(ANNOUNCEMENTS_DIR, image), { force: true });
        appendAudit(actor, 'announcement.cancelled', { announcementId });
        return json(res, 200, { ok: true });
      }
      if (action === 'publish' && req.method === 'POST') {
        if (job.status !== 'draft') return json(res, 409, { ok: false, error: 'announcement_not_draft' });
        const input = await readBody(req); const rawSchedule = input.scheduledAt === undefined ? job.scheduledAt : input.scheduledAt;
        let scheduledAt = '';
        if (rawSchedule) { const time = Date.parse(rawSchedule); if (!Number.isFinite(time) || time < Date.now() - 60_000 || time > Date.now() + 366 * 86_400_000) throw new Error('announcement_schedule_invalid'); scheduledAt = new Date(time).toISOString(); }
        job.scheduledAt = scheduledAt; job.repeatEvery = ['weekly', 'monthly'].includes(input.repeatEvery) ? input.repeatEvery : job.repeatEvery || ''; job.status = 'pending'; job.updatedAt = new Date().toISOString();
        const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(job, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(temp, file);
        appendAudit(actor, 'announcement.published', { announcementId, scheduledAt, repeatEvery: job.repeatEvery });
        return json(res, 202, { ok: true, status: job.status });
      }
      return json(res, 405, { ok: false, error: 'method_not_allowed' });
    }
    if (route === '/api/announcements' && req.method === 'GET') { requirePermission(actor, 'announcements:read'); return json(res, 200, { ok: true, announcements: readAnnouncements() }); }
    if (route === '/api/announcements' && req.method === 'POST') {
      requirePermission(actor, 'announcements:write');
      const input = await readBody(req, 23_000_000);
      const who = crypto.createHash('sha256').update(String(req.headers.authorization || '').slice(7)).digest('hex');
      const now = Date.now();
      if (now - (announcementRate.get(who) || 0) < 20_000) return json(res, 429, { ok: false, error: 'announcement_rate_limited' });
      const job = createAnnouncement(input, readConfig(WELCOME_DIR));
      announcementRate.set(who, now);
      appendAudit(actor, 'announcement.created', { announcementId: job.id, type: job.type, title: job.title, scheduledAt: job.scheduledAt });
      return json(res, 202, { ok: true, announcement: { id: job.id, status: job.status, scheduledAt: job.scheduledAt } });
    }
    if (route === '/api/config' && req.method === 'GET') { requirePermission(actor, 'config:read'); return json(res, 200, { ok: true, tickets: safeTickets(readConfig(TICKETS_DIR)), welcome: safeWelcome(readConfig(WELCOME_DIR)) }); }
    if (route === '/api/config/check' && req.method === 'POST') {
      requirePermission(actor, 'config:write'); const input = await readBody(req);
      const merged = mergeSubmitted(readConfig(TICKETS_DIR), readConfig(WELCOME_DIR), input);
      return json(res, 200, { ok: true, issues: await checkDiscordConfig(merged.ticketNext, merged.welcomeNext) });
    }
    requirePermission(actor, 'config:write');
    const input = await readBody(req);
    const ticketCfg = readConfig(TICKETS_DIR);
    const welcomeCfg = readConfig(WELCOME_DIR);
    const next = mergeSubmitted(ticketCfg, welcomeCfg, input);
    const issues = await checkDiscordConfig(next.ticketNext, next.welcomeNext);
    if (issues.length) return json(res, 422, { ok: false, error: 'discord_permission_check_failed', issues });
    saveConfigVersion(actor, next.ticketNext, next.welcomeNext, 'Configuración guardada');
    saveConfig(TICKETS_DIR, next.ticketNext);
    saveConfig(WELCOME_DIR, next.welcomeNext);
    appendAudit(actor, 'config.updated', { areas: Object.keys(input).filter(key => ['tickets', 'welcome'].includes(key)) });
    return json(res, 200, { ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[BOT-PANEL]', err.message);
    return json(res, err.message === 'permission_denied' ? 403 : 400, { ok: false, error: err.message || 'bad_request' });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[BOT-PANEL] Conector local en http://127.0.0.1:${PORT}`);
  console.log(`[BOT-PANEL] Carpetas: ${TICKETS_DIR} | ${WELCOME_DIR}`);
  const alertTimer = setInterval(monitorAlerts, 60_000); alertTimer.unref();
  setTimeout(monitorAlerts, 15_000).unref?.();
});
