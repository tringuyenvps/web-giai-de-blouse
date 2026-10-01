const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';

function db() {
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL. Hãy thêm Neon PostgreSQL connection string trong Vercel Environment Variables.');
  return neon(process.env.DATABASE_URL);
}

function json(res, status, data, headers = {}) {
  res.statusCode = status;
  Object.entries({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }).forEach(([k,v]) => res.setHeader(k,v));
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

function b64(value) { return Buffer.from(value).toString('base64url'); }
function unb64(value) { return Buffer.from(value, 'base64url').toString('utf8'); }
function secret() { return process.env.SESSION_SECRET || 'change-this-session-secret-in-vercel'; }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function makeSession(userId) {
  const payload = b64(JSON.stringify({ userId, exp: Date.now() + 7 * 86400000 }));
  return `${payload}.${sign(payload)}`;
}
function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(part => {
    const i = part.indexOf('='); return [part.slice(0,i).trim(), decodeURIComponent(part.slice(i+1).trim())];
  }));
}
function sessionUserId(req) {
  const token = readCookies(req).sid;
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try { const p = JSON.parse(unb64(payload)); return p.exp > Date.now() ? p.userId : null; } catch { return null; }
}
function cookieSecure(req) { return process.env.VERCEL === '1' || req.headers['x-forwarded-proto'] === 'https'; }
function setSession(req, res, token) {
  res.setHeader('Set-Cookie', `sid=${encodeURIComponent(token)}; HttpOnly; ${cookieSecure(req) ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=604800`);
}
function clearSession(req, res) {
  res.setHeader('Set-Cookie', `sid=; HttpOnly; ${cookieSecure(req) ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}
function safeUser(u) {
  return { id:u.id, username:u.username, fullName:u.full_name, role:u.role, status:u.status, createdAt:new Date(u.created_at).getTime(), lastLogin:u.last_login ? new Date(u.last_login).getTime() : null };
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
  await sql`CREATE TABLE IF NOT EXISTS attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exam_key TEXT NOT NULL,
    exam_name TEXT,
    subject_key TEXT NOT NULL,
    subject_name TEXT,
    score NUMERIC NOT NULL DEFAULT 0,
    max_score NUMERIC NOT NULL DEFAULT 0,
    percent NUMERIC NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    wrong_count INTEGER NOT NULL DEFAULT 0,
    unanswered_count INTEGER NOT NULL DEFAULT 0,
    used_seconds INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    breakdown JSONB,
    evaluations JSONB
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON attempts(user_id, created_at DESC)`;
  const adminHash = hashPassword(ADMIN_PASSWORD);
  await sql`INSERT INTO users (id, username, full_name, role, status, password_hash)
    VALUES ('admin_001', ${ADMIN_USERNAME}, 'Quản trị viên', 'admin', 'active', ${adminHash})
    ON CONFLICT (username) DO NOTHING`;
}

async function getUser(sql, id) {
  if (!id) return null;
  const rows = await sql`SELECT * FROM users WHERE id=${id} LIMIT 1`;
  return rows[0] || null;
}
async function requireUser(req, res, sql, roles=[]) {
  const u = await getUser(sql, sessionUserId(req));
  if (!u) { json(res, 401, {ok:false,error:'UNAUTHORIZED'}); return null; }
  if (u.status !== 'active') { clearSession(req, res); json(res, 403, {ok:false,error:'Tài khoản đang bị khóa.'}); return null; }
  if (roles.length && !roles.includes(u.role)) { json(res, 403, {ok:false,error:'FORBIDDEN'}); return null; }
  return u;
}

function pathname(req) {
  return new URL(req.url, 'https://vercel.local').pathname.replace(/\/+$/, '') || '/';
}

module.exports = async (req, res) => {
  try {
    const sql = db();
    await ensureSchema(sql);
    const path = pathname(req);

    if (req.method === 'GET' && path === '/api/me') {
      const u = await getUser(sql, sessionUserId(req));
      return json(res, 200, {ok:true, user:u && u.status==='active' ? safeUser(u) : null});
    }

    if (req.method === 'POST' && path === '/api/login') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const rows = await sql`SELECT * FROM users WHERE username=${username} LIMIT 1`;
      const u = rows[0];
      if (!u || !verifyPassword(b.password || '', u.password_hash)) return json(res, 401, {ok:false,error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
      if (u.status !== 'active') return json(res, 403, {ok:false,error:'Tài khoản đang bị khóa.'});
      await sql`UPDATE users SET last_login=NOW() WHERE id=${u.id}`;
      setSession(req, res, makeSession(u.id));
      return json(res, 200, {ok:true,user:safeUser({...u,last_login:new Date()})});
    }

    if (req.method === 'POST' && path === '/api/logout') {
      clearSession(req, res); return json(res, 200, {ok:true});
    }

    if (req.method === 'GET' && path === '/api/history') {
      const u = await requireUser(req,res,sql); if(!u) return;
      const rows = await sql`SELECT id, created_at, exam_key, exam_name, subject_key, subject_name, score, max_score, percent, correct_count, wrong_count, unanswered_count, used_seconds, reason, breakdown, evaluations
        FROM attempts WHERE user_id=${u.id} ORDER BY created_at DESC LIMIT 100`;
      return json(res,200,{ok:true,items:rows.map(mapAttempt)});
    }

    if (req.method === 'POST' && path === '/api/attempts') {
      const u = await requireUser(req,res,sql); if(!u) return;
      const b = await body(req);
      const id = String(b.id || `result_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
      const score = Number(b.score)||0, maxScore=Number(b.maxScore)||0;
      await sql`INSERT INTO attempts (id,user_id,username,exam_key,exam_name,subject_key,subject_name,score,max_score,percent,correct_count,wrong_count,unanswered_count,used_seconds,reason,breakdown,evaluations)
        VALUES (${id},${u.id},${u.username},${String(b.examKey||'')},${String(b.examName||'')},${String(b.subjectKey||'')},${String(b.subjectName||'')},${score},${maxScore},${Number(b.percent)||0},${Number(b.correctCount)||0},${Number(b.wrongCount)||0},${Number(b.unansweredCount)||0},${Number(b.usedSeconds)||0},${String(b.reason||'')},${JSON.stringify(b.breakdown||[])},${JSON.stringify(b.evaluations||[])})
        ON CONFLICT (id) DO NOTHING`;
      const rows=await sql`SELECT * FROM attempts WHERE id=${id} LIMIT 1`;
      return json(res,201,{ok:true,item:mapAttempt(rows[0])});
    }

    if (req.method === 'GET' && path === '/api/stats') {
      const u=await requireUser(req,res,sql); if(!u)return;
      const rows=await sql`SELECT exam_key, score, max_score, created_at FROM attempts WHERE user_id=${u.id} ORDER BY created_at DESC`;
      const calc=(key)=>{const a=rows.filter(x=>x.exam_key===key); const scores=a.map(x=>Number(x.score)||0); return {attempts:a.length,best:scores.length?Math.max(...scores):0,average:scores.length?scores.reduce((s,n)=>s+n,0)/scores.length:0,last:scores[0]??0,maxScore:a.length?Math.max(...a.map(x=>Number(x.max_score)||0)):0};};
      return json(res,200,{ok:true,vsat:calc('vsat'),thptqg:calc('thptqg')});
    }

    if (req.method === 'GET' && path === '/api/admin/users') {
      const u=await requireUser(req,res,sql,['admin']); if(!u)return;
      const users=await sql`SELECT * FROM users ORDER BY role DESC, created_at ASC`;
      return json(res,200,{ok:true,users:users.map(safeUser)});
    }

    if (req.method === 'POST' && path === '/api/admin/users') {
      const u=await requireUser(req,res,sql,['admin']); if(!u)return;
      const b=await body(req); const username=String(b.username||'').trim(); const password=String(b.password||''); const fullName=String(b.fullName||username).trim();
      if(!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return json(res,400,{ok:false,error:'Username 3-32 ký tự, chỉ chữ/số/._-.'});
      if(password.length<6) return json(res,400,{ok:false,error:'Mật khẩu tối thiểu 6 ký tự.'});
      const id=`user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      try { const rows=await sql`INSERT INTO users(id,username,full_name,role,status,password_hash) VALUES(${id},${username},${fullName},'student','active',${hashPassword(password)}) RETURNING *`; return json(res,201,{ok:true,user:safeUser(rows[0])}); }
      catch(e){ if(String(e.message).includes('duplicate')) return json(res,409,{ok:false,error:'Username đã tồn tại.'}); throw e; }
    }

    if (req.method === 'PATCH' && path.startsWith('/api/admin/users/')) {
      const u=await requireUser(req,res,sql,['admin']); if(!u)return;
      const id=decodeURIComponent(path.split('/').pop()); const b=await body(req); const rows=await sql`SELECT * FROM users WHERE id=${id} LIMIT 1`; const target=rows[0];
      if(!target)return json(res,404,{ok:false,error:'Không tìm thấy tài khoản.'});
      if(target.role==='admin')return json(res,400,{ok:false,error:'Không khóa tài khoản admin bằng màn hình này.'});
      const status=b.status==='active'?'active':b.status==='disabled'?'disabled':target.status;
      const password=b.password?hashPassword(String(b.password)):target.password_hash;
      if(b.password && String(b.password).length<6)return json(res,400,{ok:false,error:'Mật khẩu tối thiểu 6 ký tự.'});
      const updated=await sql`UPDATE users SET status=${status}, password_hash=${password} WHERE id=${id} RETURNING *`;
      return json(res,200,{ok:true,user:safeUser(updated[0])});
    }

    return json(res,404,{ok:false,error:'API endpoint not found'});
  } catch(e) {
    console.error(e);
    return json(res,500,{ok:false,error:e.message||'Server error'});
  }
};

function mapAttempt(x) {
  if (!x) return null;
  return {
    id:x.id, createdAt:new Date(x.created_at).getTime(), examKey:x.exam_key, examName:x.exam_name, subjectKey:x.subject_key, subjectName:x.subject_name,
    score:Number(x.score)||0, maxScore:Number(x.max_score)||0, percent:Number(x.percent)||0, correctCount:Number(x.correct_count)||0, wrongCount:Number(x.wrong_count)||0,
    unansweredCount:Number(x.unanswered_count)||0, usedSeconds:Number(x.used_seconds)||0, reason:x.reason, breakdown:x.breakdown||[], evaluations:x.evaluations||[]
  };
}
