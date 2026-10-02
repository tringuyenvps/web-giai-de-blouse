const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

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
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON không hợp lệ.')); } });
    req.on('error', reject);
  });
}
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
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return p.exp > Date.now() ? p.userId : null; }
  catch { return null; }
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function safeUser(u) {
  return { id:u.id, username:u.username, fullName:u.full_name, role:u.role, status:u.status, createdAt:new Date(u.created_at).getTime(), lastLogin:u.last_login ? new Date(u.last_login).getTime() : null };
}

module.exports = async (req, res) => {
  try {
    const sql = db();
    const adminRows = await sql`SELECT * FROM users WHERE id=${sessionUserId(req)} LIMIT 1`;
    const admin = adminRows[0];
    if (!admin) return json(res, 401, {ok:false,error:'UNAUTHORIZED'});
    if (admin.status !== 'active') return json(res, 403, {ok:false,error:'Tài khoản đang bị khóa.'});
    if (admin.role !== 'admin') return json(res, 403, {ok:false,error:'FORBIDDEN'});

    if (req.method !== 'PATCH') return json(res, 405, {ok:false,error:'Method not allowed.'}, {Allow:'PATCH'});

    const id = String(req.query?.id || '').trim();
    if (!id) return json(res, 400, {ok:false,error:'Thiếu id tài khoản.'});
    const rows = await sql`SELECT * FROM users WHERE id=${id} LIMIT 1`;
    const target = rows[0];
    if (!target) return json(res, 404, {ok:false,error:'Không tìm thấy tài khoản.'});
    if (target.role === 'admin') return json(res, 400, {ok:false,error:'Không khóa tài khoản admin bằng màn hình này.'});

    const b = await body(req);
    const status = b.status === 'active' ? 'active' : b.status === 'disabled' ? 'disabled' : target.status;
    if (b.password && String(b.password).length < 6) return json(res, 400, {ok:false,error:'Mật khẩu tối thiểu 6 ký tự.'});
    const password = b.password ? hashPassword(String(b.password)) : target.password_hash;
    const updated = await sql`UPDATE users SET status=${status}, password_hash=${password} WHERE id=${id} RETURNING *`;
    return json(res, 200, {ok:true,user:safeUser(updated[0])});
  } catch (e) {
    console.error(e);
    return json(res, 500, {ok:false,error:e.message || 'Server error'});
  }
};
