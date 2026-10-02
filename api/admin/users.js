const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';

function db() {
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL.');
  return neon(process.env.DATABASE_URL);
}
function json(res, status, data, headers = {}) {
  res.statusCode = status;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
    .forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(data));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 8_000_000) reject(new Error('Payload too large')); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('JSON không hợp lệ.')); }
    });
    req.on('error', reject);
  });
}
function b64(v) { return Buffer.from(v).toString('base64url'); }
function unb64(v) { return Buffer.from(v, 'base64url').toString('utf8'); }
function secret() { return process.env.SESSION_SECRET || 'change-this-session-secret-in-vercel'; }
function sign(v) { return crypto.createHmac('sha256', secret()).update(v).digest('base64url'); }
function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
  }));
}
function sessionUserId(req) {
  const token = readCookies(req).sid;
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(unb64(payload));
    return p.exp > Date.now() ? p.userId : null;
  } catch { return null; }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function safeUser(u) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role,
    status: u.status,
    createdAt: new Date(u.created_at).getTime(),
    lastLogin: u.last_login ? new Date(u.last_login).getTime() : null
  };
}
async function ensureSchema(sql) {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    status TEXT NOT NULL DEFAULT 'active',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
  )`;
  const adminHash = hashPassword(ADMIN_PASSWORD);
  await sql`INSERT INTO users (id, username, full_name, role, status, password_hash)
    VALUES ('admin_001', ${ADMIN_USERNAME}, 'Quản trị viên', 'admin', 'active', ${adminHash})
    ON CONFLICT (username) DO NOTHING`;
}
async function requireAdmin(req, res, sql) {
  const uRows = await sql`SELECT * FROM users WHERE id=${sessionUserId(req)} LIMIT 1`;
  const u = uRows[0];
  if (!u) { json(res, 401, { ok: false, error: 'UNAUTHORIZED' }); return null; }
  if (u.status !== 'active') { json(res, 403, { ok: false, error: 'Tài khoản đang bị khóa.' }); return null; }
  if (u.role !== 'admin') { json(res, 403, { ok: false, error: 'FORBIDDEN' }); return null; }
  return u;
}

module.exports = async (req, res) => {
  try {
    const sql = db();
    await ensureSchema(sql);
    const admin = await requireAdmin(req, res, sql);
    if (!admin) return;

    if (req.method === 'GET') {
      const users = await sql`SELECT * FROM users ORDER BY role DESC, created_at ASC`;
      return json(res, 200, { ok: true, users: users.map(safeUser) });
    }

    if (req.method === 'POST') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const fullName = String(b.fullName || username).trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
        return json(res, 400, { ok: false, error: 'Username 3-32 ký tự, chỉ chữ/số/._-.' });
      }
      if (password.length < 6) {
        return json(res, 400, { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự.' });
      }
      if (!fullName) return json(res, 400, { ok: false, error: 'Họ tên không được để trống.' });

      const id = `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      try {
        const rows = await sql`INSERT INTO users
          (id, username, full_name, role, status, password_hash)
          VALUES (${id}, ${username}, ${fullName}, 'student', 'active', ${hashPassword(password)})
          RETURNING *`;
        return json(res, 201, { ok: true, user: safeUser(rows[0]) });
      } catch (e) {
        if (String(e.message).toLowerCase().includes('duplicate')) {
          return json(res, 409, { ok: false, error: 'Username đã tồn tại.' });
        }
        throw e;
      }
    }

    return json(res, 405, { ok: false, error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message || 'Server error' });
  }
};
