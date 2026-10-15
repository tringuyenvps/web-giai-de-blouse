const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@123';

function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Thiếu DATABASE_URL. Hãy thêm Neon PostgreSQL connection string trong Vercel Environment Variables.');
  }
  return neon(process.env.DATABASE_URL);
}

function json(res, status, data, headers = {}) {
  res.statusCode = status;
  Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  }).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 25_000_000) reject(new Error('Dữ liệu tải lên quá lớn (tối đa 25MB). Hãy giảm dung lượng ảnh hoặc file.'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON không hợp lệ.'));
      }
    });
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
  } catch {
    return null;
  }
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
  } catch {
    return false;
  }
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

  await sql`CREATE TABLE IF NOT EXISTS exam_papers (
    id TEXT PRIMARY KEY,
    exam_key TEXT NOT NULL,
    subject_key TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    source_title TEXT,
    source_file TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 50,
    max_score NUMERIC NOT NULL DEFAULT 150,
    passages JSONB NOT NULL DEFAULT '[]'::jsonb,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_exam_papers_lookup ON exam_papers(exam_key, subject_key, is_deleted, updated_at DESC)`;

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

async function requireUser(req, res, sql, roles = []) {
  const u = await getUser(sql, sessionUserId(req));
  if (!u) { json(res, 401, { ok: false, error: 'UNAUTHORIZED' }); return null; }
  if (u.status !== 'active') { clearSession(req, res); json(res, 403, { ok: false, error: 'Tài khoản đang bị khóa.' }); return null; }
  if (roles.length && !roles.includes(u.role)) { json(res, 403, { ok: false, error: 'FORBIDDEN' }); return null; }
  return u;
}

function parseUrl(req) {
  const u = new URL(req.url, 'https://vercel.local');
  return {
    pathname: u.pathname.replace(/\/+$/, '') || '/',
    searchParams: u.searchParams
  };
}

function mapExamPaper(row) {
  if (!row) return null;
  return {
    id: row.id,
    exam: row.exam_key,
    examKey: row.exam_key,
    subject: row.subject_key,
    subjectKey: row.subject_key,
    code: row.code,
    sourceCode: row.code,
    title: row.title,
    sourceTitle: row.source_title || '',
    sourceFile: row.source_file || '',
    durationMinutes: Number(row.duration_minutes) || 50,
    maxScore: Number(row.max_score) || 150,
    passages: Array.isArray(row.passages) ? row.passages : [],
    questions: Array.isArray(row.questions) ? row.questions : [],
    isPublished: Boolean(row.is_published),
    isDeleted: Boolean(row.is_deleted),
    updatedBy: row.updated_by || 'admin',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
  };
}

/* ---------------- Rule-Based Smart Parser (Kịch bản 2: Để trống đáp án cho Admin tự chọn) ---------------- */
function parseExamTextRuleBased(text, examKey = 'vsat', subjectKey = 'toan', autoSolve = false) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const questions = [];
  const passages = [];
  let currentPassage = null;

  const qHeaderRegex = /^(?:Câu|Bài|Question)\s*(\d+)[\s.:\-–—]+(.*)/i;
  const passageHeaderRegex = /(?:đọc\s+(?:đoạn\s+)?(?:thông\s+tin|ngữ\s+liệu|văn\s+bản|bài\s+đọc)?.*?(?:từ\s+câu|câu)\s*(\d+)\s*(?:đến|–|-)\s*(?:câu\s*)?(\d+))/i;
  const optRegex = /^\s*([A-D])[\.\:\)]\s*(.*)/;
  const stmtRegex = /^\s*([a-d])[\.\:\)]\s*(.*)/;

  let currentQ = null;
  let currentMode = 'text';
  let rawAnswerMap = {};

  const fullText = lines.join('\n');
  const ansBlockMatch = fullText.match(/(?:BẢNG\s+ĐÁP\s+ÁN|ĐÁP\s+ÁN)[\s\S]*$/i);
  if (ansBlockMatch) {
    const ansText = ansBlockMatch[0];
    const pairRegex = /(\d+)\s*[:.\-=–—]?\s*([A-D])/gi;
    let m;
    while ((m = pairRegex.exec(ansText)) !== null) {
      rawAnswerMap[m[1]] = m[2].toUpperCase();
    }
  }

  function flushCurrentQ() {
    if (!currentQ) return;
    if (currentQ.type === 'mcq' && (!currentQ.options || currentQ.options.length === 0)) {
      currentQ.options = [
        { key: 'A', text: 'Phương án A' },
        { key: 'B', text: 'Phương án B' },
        { key: 'C', text: 'Phương án C' },
        { key: 'D', text: 'Phương án D' }
      ];
    }
    if (currentQ.type === 'true_false' && (!currentQ.statements || currentQ.statements.length === 0)) {
      currentQ.statements = [
        { key: 'a', text: 'Mệnh đề a' },
        { key: 'b', text: 'Mệnh đề b' },
        { key: 'c', text: 'Mệnh đề c' },
        { key: 'd', text: 'Mệnh đề d' }
      ];
    }
    const qNum = currentQ.questionNumber;
    if (rawAnswerMap[qNum]) {
      currentQ.answer = rawAnswerMap[qNum];
    } else if (autoSolve) {
      if (currentQ.type === 'mcq' && !currentQ.answer) currentQ.answer = 'A';
      if (currentQ.type === 'true_false') currentQ.answer = { a: true, b: false, c: true, d: false };
      if (currentQ.type === 'short_answer' && !currentQ.answer) {
        currentQ.answer = '0';
        currentQ.acceptedAnswers = ['0'];
      }
    } else {
      // KỊCH BẢN 2: Để trống đáp án hoàn toàn để Admin tự tích chọn trên giao diện Web
      if (currentQ.type === 'mcq') currentQ.answer = '';
      else if (currentQ.type === 'true_false') currentQ.answer = {};
      else if (currentQ.type === 'matching') currentQ.answer = {};
      else if (currentQ.type === 'short_answer') {
        currentQ.answer = '';
        currentQ.acceptedAnswers = [];
      }
    }
    questions.push(currentQ);
    currentQ = null;
    currentMode = 'text';
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;

    const passMatch = line.match(passageHeaderRegex);
    if (passMatch) {
      flushCurrentQ();
      const fromQ = Math.max(1, parseInt(passMatch[1], 10));
      const toQ = Math.max(fromQ, parseInt(passMatch[2], 10));
      currentPassage = {
        id: `passage_${passages.length + 1}_${fromQ}_${toQ}`,
        fromQuestion: fromQ,
        toQuestion: toQ,
        title: line,
        text: '',
        image: ''
      };
      passages.push(currentPassage);
      continue;
    }

    const qMatch = line.match(qHeaderRegex);
    if (qMatch) {
      flushCurrentQ();
      const qNum = parseInt(qMatch[1], 10);
      const qText = qMatch[2].trim();

      let type = 'mcq';
      let part = 2;
      let partTitle = 'PHẦN II — Trắc nghiệm 4 lựa chọn';
      if (examKey === 'vsat') {
        if (qNum <= 9) { type = 'true_false'; part = 1; partTitle = 'PHẦN I — Trắc nghiệm Đúng / Sai'; }
        else if (qNum <= 15) { type = 'mcq'; part = 2; partTitle = 'PHẦN II — Đọc ngữ liệu & Trắc nghiệm 4 lựa chọn'; }
        else if (qNum <= 20) { type = 'matching'; part = 3; partTitle = 'PHẦN III — Trắc nghiệm Ghép hợp'; }
        else { type = 'short_answer'; part = 4; partTitle = 'PHẦN IV — Trắc nghiệm Trả lời ngắn'; }
      } else {
        if (qNum <= 12) { type = 'mcq'; part = 1; partTitle = 'PHẦN I — Trắc nghiệm 4 lựa chọn'; }
        else if (qNum <= 16) { type = 'true_false'; part = 2; partTitle = 'PHẦN II — Trắc nghiệm Đúng / Sai'; }
        else { type = 'short_answer'; part = 3; partTitle = 'PHẦN III — Trắc nghiệm Trả lời ngắn'; }
      }

      currentQ = {
        id: `q_${Date.now().toString(36)}_${qNum}`,
        questionNumber: qNum,
        type,
        part,
        partTitle,
        text: qText,
        options: [],
        statements: [],
        pairs: [],
        answer: type === 'mcq' ? '' : (type === 'short_answer' ? '' : {}),
        acceptedAnswers: [],
        explanation: '',
        image: ''
      };

      const matchedP = passages.find(p => qNum >= p.fromQuestion && qNum <= p.toQuestion);
      if (matchedP) {
        currentQ.passageId = matchedP.id;
        currentQ.passageFrom = matchedP.fromQuestion;
        currentQ.passageTo = matchedP.toQuestion;
        currentQ.passageTitle = matchedP.title;
        currentQ.passageText = matchedP.text;
      }
      continue;
    }

    if (currentPassage && !currentQ && !line.match(/^BẢNG\s+ĐÁP\s+ÁN/i)) {
      currentPassage.text = currentPassage.text ? `${currentPassage.text}\n${line}` : line;
      continue;
    }

    if (!currentQ) continue;

    // Auto-switch question type if statements a) b) c) d) or options A. B. C. D. appear
    const multipleOpts = line.match(/([A-D])[\.\:\)]\s*([^A-D]+)/g);
    if (multipleOpts && multipleOpts.length >= 2) {
      currentQ.type = 'mcq';
      multipleOpts.forEach(chunk => {
        const sm = chunk.match(/^([A-D])[\.\:\)]\s*(.*)/i);
        if (sm) {
          const k = sm[1].toUpperCase();
          const t = sm[2].trim();
          if (!currentQ.options.some(o => o.key === k)) {
            currentQ.options.push({ key: k, text: t });
          }
        }
      });
      currentMode = 'options';
      continue;
    }

    const singleOpt = line.match(optRegex);
    if (singleOpt) {
      currentQ.type = 'mcq';
      const k = singleOpt[1].toUpperCase();
      const t = singleOpt[2].trim();
      if (!currentQ.options.some(o => o.key === k)) {
        currentQ.options.push({ key: k, text: t });
      }
      currentMode = 'options';
      continue;
    }

    const singleStmt = line.match(stmtRegex);
    if (singleStmt) {
      currentQ.type = 'true_false';
      const k = singleStmt[1].toLowerCase();
      const t = singleStmt[2].trim();
      if (!currentQ.statements.some(s => s.key === k)) {
        currentQ.statements.push({ key: k, text: t });
      }
      currentMode = 'statements';
      continue;
    }

    if (currentMode === 'options' && currentQ.options.length) {
      currentQ.options[currentQ.options.length - 1].text += ` ${line}`;
    } else if (currentMode === 'statements' && currentQ.statements.length) {
      currentQ.statements[currentQ.statements.length - 1].text += ` ${line}`;
    } else {
      currentQ.text += (currentQ.text ? `\n${line}` : line);
    }
  }

  flushCurrentQ();

  if (!questions.length) {
    questions.push({
      id: `q_${Date.now()}_1`,
      questionNumber: 1,
      type: 'mcq',
      part: 1,
      partTitle: 'PHẦN I — Trắc nghiệm',
      text: text ? String(text).slice(0, 300) : 'Câu hỏi 1',
      options: [
        { key: 'A', text: 'Phương án A' },
        { key: 'B', text: 'Phương án B' },
        { key: 'C', text: 'Phương án C' },
        { key: 'D', text: 'Phương án D' }
      ],
      answer: '',
      explanation: ''
    });
  }

  return {
    title: `Đề thi bóc tách ${examKey.toUpperCase()} - Môn ${subjectKey.toUpperCase()}`,
    code: `${subjectKey}_ocr_${Date.now().toString(36)}`,
    durationMinutes: ['toan', 'ngu_van'].includes(subjectKey) ? 90 : 50,
    maxScore: examKey === 'vsat' ? 150 : 10,
    passages,
    questions
  };
}

/* ---------------- Call Google Gemini Multimodal API ---------------- */
async function callGeminiForExamParsing({ apiKey, text, fileData, mimeType, examKey, subjectKey, autoSolve }) {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastErr = null;

  const answerInstruction = autoSolve
    ? `If the exam has an answer key table, extract the exact answers. If the exam does NOT have an answer key, solve each question accurately and fill in "answer" and "explanation".`
    : `SCENARIO 2 (STRICT): Do NOT solve or guess answers! Unless an explicit answer key table is printed in the document, leave all answers BLANK so the Admin can select them manually:
       - For "mcq": set "answer": ""
       - For "true_false": set "answer": {}
       - For "matching": set "answer": {}
       - For "short_answer": set "answer": "" and "acceptedAnswers": []`;

  const systemPrompt = `You are a strict, top-tier Vietnamese standardized exam OCR parser (VSAT and THPTQG).
Task: Extract ALL questions, options, sub-statements, matching pairs, and reading passages from the provided exam document (PDF, image, or text) into a SINGLE clean JSON object.

Target Exam Key: "${examKey}" (either 'vsat' or 'thptqg')
Target Subject Key: "${subjectKey}"

ANSWER HANDLING RULE:
${answerInstruction}

IMPORTANT EXTRACTION RULES:
1. Identify all Reading Passages (Đoạn ngữ liệu đọc hiểu / giả thiết thí nghiệm). If a passage applies to a range of questions (e.g. "Đọc đoạn thông tin sau và trả lời các câu hỏi từ câu 10 đến câu 12"), put it in "passages": [{"fromQuestion": 10, "toQuestion": 12, "title": "...", "text": "..."}].
2. Multiple Choice 4 options ("type": "mcq"):
   - Put choices into "options": [{"key": "A", "text": "..."}, {"key": "B", "text": "..."}, {"key": "C", "text": "..."}, {"key": "D", "text": "..."}].
3. True/False 4 statements ("type": "true_false"):
   - Put 4 sub-statements into "statements": [{"key": "a", "text": "..."}, {"key": "b", "text": "..."}, {"key": "c", "text": "..."}, {"key": "d", "text": "..."}].
4. Matching questions ("type": "matching"):
   - "pairs": [{"key": "1", "left": "...", "options": [{"key": "A", "text": "..."}, ...]}].
5. Short Answer questions ("type": "short_answer"):
   - Extract question text accurately.
6. Convert mathematical and chemical formulas into clean standard LaTeX enclosed in $...$ (e.g. $x^2 + 2x = 0$, $H_2SO_4$, $\\sqrt{2}$).
7. Return ONLY pure valid JSON with no markdown backticks. Schema:
{
  "title": "string",
  "code": "string",
  "durationMinutes": number,
  "maxScore": number,
  "passages": [
    { "fromQuestion": number, "toQuestion": number, "title": "string", "text": "string" }
  ],
  "questions": [
    {
      "questionNumber": number,
      "type": "true_false" | "mcq" | "matching" | "short_answer",
      "part": number,
      "partTitle": "string",
      "text": "string",
      "options": [ {"key": "A", "text": "..."} ],
      "statements": [ {"key": "a", "text": "..."} ],
      "pairs": [ {"key": "1", "left": "...", "options": [...]} ],
      "answer": "string or object",
      "acceptedAnswers": [ "string" ],
      "explanation": "string"
    }
  ]
}`;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const parts = [];

      if (fileData && mimeType) {
        let base64Clean = String(fileData);
        if (base64Clean.includes(';base64,')) {
          base64Clean = base64Clean.split(';base64,')[1];
        }
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Clean
          }
        });
      }

      if (text) {
        parts.push({ text: `Văn bản đề thi:\n${String(text).slice(0, 100_000)}` });
      } else {
        parts.push({ text: `Hãy bóc tách toàn bộ câu hỏi và phương án từ tài liệu đính kèm trên theo cấu trúc ${examKey.toUpperCase()} môn ${subjectKey}.` });
      }

      const payload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Gemini API không trả về nội dung.');

      const cleanJsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanJsonText);

      // If Scenario 2 (autoSolve === false), ensure answers are left blank unless explicitly extracted from an answer key
      if (!autoSolve && Array.isArray(parsed.questions)) {
        parsed.questions.forEach(q => {
          if (q.type === 'mcq' && !q.answer) q.answer = '';
          else if (q.type === 'true_false' && !q.answer) q.answer = {};
          else if (q.type === 'matching' && !q.answer) q.answer = {};
          else if (q.type === 'short_answer' && !q.answer) {
            q.answer = '';
            q.acceptedAnswers = [];
          }
        });
      }

      return parsed;
    } catch (e) {
      console.warn(`[My Exam AI] Model ${model} failed:`, e.message);
      lastErr = e;
    }
  }

  throw lastErr || new Error('Không gọi được mô hình Gemini.');
}

module.exports = async (req, res) => {
  try {
    const sql = db();
    await ensureSchema(sql);
    const { pathname: path, searchParams } = parseUrl(req);

    if (req.method === 'GET' && path === '/api/me') {
      const u = await getUser(sql, sessionUserId(req));
      return json(res, 200, { ok: true, user: u && u.status === 'active' ? safeUser(u) : null });
    }

    if (req.method === 'POST' && path === '/api/login') {
      const b = await body(req);
      const username = String(b.username || '').trim();
      const rows = await sql`SELECT * FROM users WHERE username=${username} LIMIT 1`;
      const u = rows[0];
      if (!u || !verifyPassword(b.password || '', u.password_hash)) {
        return json(res, 401, { ok: false, error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
      }
      if (u.status !== 'active') return json(res, 403, { ok: false, error: 'Tài khoản đang bị khóa.' });
      await sql`UPDATE users SET last_login=NOW() WHERE id=${u.id}`;
      setSession(req, res, makeSession(u.id));
      return json(res, 200, { ok: true, user: safeUser({ ...u, last_login: new Date() }) });
    }

    if (req.method === 'POST' && path === '/api/logout') {
      clearSession(req, res);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && path === '/api/history') {
      const u = await requireUser(req, res, sql);
      if (!u) return;
      const rows = await sql`SELECT id, created_at, exam_key, exam_name, subject_key, subject_name, score, max_score, percent, correct_count, wrong_count, unanswered_count, used_seconds, reason, breakdown, evaluations
        FROM attempts WHERE user_id=${u.id} ORDER BY created_at DESC LIMIT 100`;
      return json(res, 200, { ok: true, items: rows.map(mapAttempt) });
    }

    if (req.method === 'POST' && path === '/api/attempts') {
      const u = await requireUser(req, res, sql);
      if (!u) return;
      const b = await body(req);
      const id = String(b.id || `result_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
      const score = Number(b.score) || 0, maxScore = Number(b.maxScore) || 0;
      await sql`INSERT INTO attempts (id,user_id,username,exam_key,exam_name,subject_key,subject_name,score,max_score,percent,correct_count,wrong_count,unanswered_count,used_seconds,reason,breakdown,evaluations)
        VALUES (${id},${u.id},${u.username},${String(b.examKey || '')},${String(b.examName || '')},${String(b.subjectKey || '')},${String(b.subjectName || '')},${score},${maxScore},${Number(b.percent) || 0},${Number(b.correctCount) || 0},${Number(b.wrongCount) || 0},${Number(b.unansweredCount) || 0},${Number(b.usedSeconds) || 0},${String(b.reason || '')},${JSON.stringify(b.breakdown || [])},${JSON.stringify(b.evaluations || [])})
        ON CONFLICT (id) DO NOTHING`;
      const rows = await sql`SELECT * FROM attempts WHERE id=${id} LIMIT 1`;
      return json(res, 201, { ok: true, item: mapAttempt(rows[0]) });
    }

    if (req.method === 'GET' && path === '/api/stats') {
      const u = await requireUser(req, res, sql);
      if (!u) return;
      const rows = await sql`SELECT exam_key, score, max_score, created_at FROM attempts WHERE user_id=${u.id} ORDER BY created_at DESC`;
      const calc = (key) => {
        const a = rows.filter(x => x.exam_key === key);
        const scores = a.map(x => Number(x.score) || 0);
        return {
          attempts: a.length,
          best: scores.length ? Math.max(...scores) : 0,
          average: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : 0,
          last: scores[0] ?? 0,
          maxScore: a.length ? Math.max(...a.map(x => Number(x.max_score) || 0)) : 0
        };
      };
      return json(res, 200, { ok: true, vsat: calc('vsat'), thptqg: calc('thptqg') });
    }

    /* ---------------- Public / Authenticated Exam Paper Endpoints ---------------- */
    if (req.method === 'GET' && path === '/api/exams') {
      const examKey = String(searchParams.get('exam') || '').trim();
      const subjectKey = String(searchParams.get('subject') || '').trim();
      let rows;
      if (examKey && subjectKey) {
        rows = await sql`SELECT * FROM exam_papers WHERE exam_key=${examKey} AND subject_key=${subjectKey} ORDER BY updated_at DESC`;
      } else if (examKey) {
        rows = await sql`SELECT * FROM exam_papers WHERE exam_key=${examKey} ORDER BY updated_at DESC`;
      } else {
        rows = await sql`SELECT * FROM exam_papers ORDER BY updated_at DESC`;
      }
      return json(res, 200, { ok: true, items: rows.map(mapExamPaper) });
    }

    if (req.method === 'GET' && path.startsWith('/api/exams/')) {
      const id = decodeURIComponent(path.slice('/api/exams/'.length));
      const rows = await sql`SELECT * FROM exam_papers WHERE id=${id} LIMIT 1`;
      if (!rows[0]) return json(res, 404, { ok: false, error: 'Không tìm thấy đề thi.' });
      return json(res, 200, { ok: true, item: mapExamPaper(rows[0]) });
    }

    /* ---------------- AI OCR / Smart Exam Parser Endpoint ---------------- */
    if (req.method === 'POST' && path === '/api/admin/ai-parse-exam') {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const b = await body(req);

      const examKey = String(b.examKey || b.exam || 'vsat').trim().toLowerCase();
      const subjectKey = String(b.subjectKey || b.subject || 'sinh').trim().toLowerCase();
      // Mặc định Kịch bản 2: autoSolve = false (chỉ bóc tách câu hỏi, để trống đáp án cho Admin tự chọn)
      const autoSolve = Boolean(b.autoSolve === true);
      const apiKey = String(b.apiKey || req.headers['x-gemini-key'] || process.env.GEMINI_API_KEY || '').trim();
      const text = String(b.text || '').trim();
      const fileData = b.fileData ? String(b.fileData) : null;
      let mimeType = b.mimeType ? String(b.mimeType) : null;

      if (!mimeType && fileData) {
        const m = fileData.match(/^data:([^;]+);base64,/);
        if (m) mimeType = m[1];
      }

      if (!text && !fileData) {
        return json(res, 400, { ok: false, error: 'Vui lòng cung cấp văn bản đề thi hoặc đính kèm file PDF/ảnh đề thi.' });
      }

      if (apiKey) {
        try {
          const parsed = await callGeminiForExamParsing({
            apiKey,
            text,
            fileData,
            mimeType,
            examKey,
            subjectKey,
            autoSolve
          });
          const id = `exam_${examKey}_${subjectKey}_ai_${Date.now()}`;
          const formatted = {
            id,
            examKey,
            subjectKey,
            code: parsed.code || `${subjectKey}_ocr_${Date.now().toString(36)}`,
            title: parsed.title || `Đề thi bóc tách AI - Môn ${subjectKey.toUpperCase()}`,
            sourceTitle: parsed.sourceTitle || (fileData ? 'Bóc tách từ file PDF/ảnh bằng AI OCR' : 'Bóc tách văn bản bằng AI OCR'),
            sourceFile: '',
            isCloud: true,
            durationMinutes: Number(parsed.durationMinutes) || (['toan', 'ngu_van'].includes(subjectKey) ? 90 : 50),
            maxScore: Number(parsed.maxScore) || (examKey === 'vsat' ? 150 : 10),
            passages: Array.isArray(parsed.passages) ? parsed.passages : [],
            questions: Array.isArray(parsed.questions) ? parsed.questions : []
          };
          return json(res, 200, {
            ok: true,
            item: formatted,
            usedAI: true,
            message: autoSolve
              ? `AI đã bóc tách ${formatted.questions.length} câu hỏi kèm đáp án gợi ý.`
              : `AI đã bóc tách ${formatted.questions.length} câu hỏi (để trống đáp án). Hãy tích chọn đáp án đúng cho từng câu rồi bấm Lưu!`
          });
        } catch (aiErr) {
          console.warn('[My Exam AI] Gemini API failed, falling back to rule-based parser:', aiErr.message);
          if (text) {
            const fallback = parseExamTextRuleBased(text, examKey, subjectKey, autoSolve);
            fallback.id = `exam_${examKey}_${subjectKey}_fallback_${Date.now()}`;
            fallback.examKey = examKey;
            fallback.subjectKey = subjectKey;
            fallback.isCloud = true;
            return json(res, 200, {
              ok: true,
              item: fallback,
              usedAI: false,
              message: `Đã bóc tách ${fallback.questions.length} câu hỏi (để trống đáp án để Admin tự chọn).`
            });
          }
          return json(res, 500, {
            ok: false,
            error: `Lỗi kết nối Gemini API: ${aiErr.message}.`
          });
        }
      }

      if (text) {
        const fallback = parseExamTextRuleBased(text, examKey, subjectKey, autoSolve);
        fallback.id = `exam_${examKey}_${subjectKey}_smart_${Date.now()}`;
        fallback.examKey = examKey;
        fallback.subjectKey = subjectKey;
        fallback.isCloud = true;
        return json(res, 200, {
          ok: true,
          item: fallback,
          usedAI: false,
          message: `Đã bóc tách ${fallback.questions.length} câu hỏi (để trống đáp án). Hãy tích chọn đáp án đúng cho từng câu rồi bấm Lưu!`
        });
      }

      return json(res, 400, {
        ok: false,
        error: 'Để đọc file ảnh chụp không có lớp chữ, hãy nhập Gemini API Key hoặc tải file PDF có lớp văn bản / dán văn bản đề thi.'
      });
    }

    /* ---------------- Admin Exam Management Endpoints ---------------- */
    if ((req.method === 'POST' || req.method === 'PUT') && path === '/api/admin/exams') {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const b = await body(req);
      const examKey = String(b.examKey || b.exam || '').trim().toLowerCase();
      const subjectKey = String(b.subjectKey || b.subject || '').trim().toLowerCase();
      const title = String(b.title || '').trim();
      if (!examKey || !subjectKey) return json(res, 400, { ok: false, error: 'Thiếu kỳ thi (examKey) hoặc môn học (subjectKey).' });
      if (!title) return json(res, 400, { ok: false, error: 'Tên đề thi không được để trống.' });
      const questions = Array.isArray(b.questions) ? b.questions : [];
      if (!questions.length) return json(res, 400, { ok: false, error: 'Đề thi phải có ít nhất 1 câu hỏi.' });

      const sourceFile = String(b.sourceFile || '').trim();
      const code = String(b.code || b.sourceCode || `${subjectKey}_${Date.now().toString(36)}`).trim();
      const id = String(b.id || (sourceFile ? `static__${examKey}__${subjectKey}__${sourceFile}` : `exam_${examKey}_${subjectKey}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`)).trim();
      const sourceTitle = String(b.sourceTitle || '').trim();
      const durationMinutes = Number(b.durationMinutes) || (['toan', 'ngu_van'].includes(subjectKey) ? 90 : 50);
      const maxScore = Number(b.maxScore) || (examKey === 'vsat' ? 150 : 10);
      const passages = Array.isArray(b.passages) ? b.passages : [];
      const isPublished = b.isPublished !== false;
      const isDeleted = Boolean(b.isDeleted);

      const rows = await sql`
        INSERT INTO exam_papers (
          id, exam_key, subject_key, code, title, source_title, source_file,
          duration_minutes, max_score, passages, questions, is_published, is_deleted, updated_by, updated_at
        ) VALUES (
          ${id}, ${examKey}, ${subjectKey}, ${code}, ${title}, ${sourceTitle}, ${sourceFile},
          ${durationMinutes}, ${maxScore}, ${JSON.stringify(passages)}::jsonb, ${JSON.stringify(questions)}::jsonb,
          ${isPublished}, ${isDeleted}, ${u.username}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          exam_key = EXCLUDED.exam_key,
          subject_key = EXCLUDED.subject_key,
          code = EXCLUDED.code,
          title = EXCLUDED.title,
          source_title = EXCLUDED.source_title,
          source_file = EXCLUDED.source_file,
          duration_minutes = EXCLUDED.duration_minutes,
          max_score = EXCLUDED.max_score,
          passages = EXCLUDED.passages,
          questions = EXCLUDED.questions,
          is_published = EXCLUDED.is_published,
          is_deleted = EXCLUDED.is_deleted,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      `;
      return json(res, 200, { ok: true, item: mapExamPaper(rows[0]) });
    }

    if ((req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') && path.startsWith('/api/admin/exams/')) {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const id = decodeURIComponent(path.slice('/api/admin/exams/'.length));
      if (!id) return json(res, 400, { ok: false, error: 'Thiếu ID đề thi.' });

      if (req.method === 'DELETE') {
        const soft = searchParams.get('soft') === '1' || id.startsWith('static__');
        if (soft) {
          const examKey = String(searchParams.get('exam') || 'vsat');
          const subjectKey = String(searchParams.get('subject') || 'toan');
          const sourceFile = String(searchParams.get('sourceFile') || '');
          await sql`
            INSERT INTO exam_papers (id, exam_key, subject_key, code, title, source_file, is_published, is_deleted, updated_by, updated_at)
            VALUES (${id}, ${examKey}, ${subjectKey}, ${id}, 'Deleted Static Exam', ${sourceFile}, FALSE, TRUE, ${u.username}, NOW())
            ON CONFLICT (id) DO UPDATE SET is_deleted = TRUE, is_published = FALSE, updated_at = NOW()
          `;
        } else {
          await sql`DELETE FROM exam_papers WHERE id=${id}`;
        }
        return json(res, 200, { ok: true, deletedId: id });
      }

      const existingRows = await sql`SELECT * FROM exam_papers WHERE id=${id} LIMIT 1`;
      const existing = existingRows[0];
      if (!existing) return json(res, 404, { ok: false, error: 'Không tìm thấy đề thi để cập nhật.' });
      const b = await body(req);

      const title = b.title !== undefined ? String(b.title).trim() : existing.title;
      const code = b.code !== undefined ? String(b.code).trim() : existing.code;
      const sourceTitle = b.sourceTitle !== undefined ? String(b.sourceTitle).trim() : existing.source_title;
      const durationMinutes = b.durationMinutes !== undefined ? Number(b.durationMinutes) : existing.duration_minutes;
      const maxScore = b.maxScore !== undefined ? Number(b.maxScore) : existing.max_score;
      const passages = Array.isArray(b.passages) ? b.passages : existing.passages;
      const questions = Array.isArray(b.questions) ? b.questions : existing.questions;
      const isPublished = b.isPublished !== undefined ? Boolean(b.isPublished) : existing.is_published;
      const isDeleted = b.isDeleted !== undefined ? Boolean(b.isDeleted) : existing.is_deleted;

      const updatedRows = await sql`
        UPDATE exam_papers SET
          title = ${title},
          code = ${code},
          source_title = ${sourceTitle},
          duration_minutes = ${durationMinutes},
          max_score = ${maxScore},
          passages = ${JSON.stringify(passages)}::jsonb,
          questions = ${JSON.stringify(questions)}::jsonb,
          is_published = ${isPublished},
          is_deleted = ${isDeleted},
          updated_by = ${u.username},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return json(res, 200, { ok: true, item: mapExamPaper(updatedRows[0]) });
    }

    /* ---------------- Admin Users Endpoints ---------------- */
    if (req.method === 'GET' && path === '/api/admin/users') {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const users = await sql`SELECT * FROM users ORDER BY role DESC, created_at ASC`;
      return json(res, 200, { ok: true, users: users.map(safeUser) });
    }

    if (req.method === 'POST' && path === '/api/admin/users') {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const b = await body(req);
      const username = String(b.username || '').trim();
      const password = String(b.password || '');
      const fullName = String(b.fullName || username).trim();
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return json(res, 400, { ok: false, error: 'Username 3-32 ký tự, chỉ chữ/số/._-.' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự.' });
      const id = `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      try {
        const rows = await sql`INSERT INTO users(id,username,full_name,role,status,password_hash) VALUES(${id},${username},${fullName},'student','active',${hashPassword(password)}) RETURNING *`;
        return json(res, 201, { ok: true, user: safeUser(rows[0]) });
      } catch (e) {
        if (String(e.message).includes('duplicate')) return json(res, 409, { ok: false, error: 'Username đã tồn tại.' });
        throw e;
      }
    }

    if (req.method === 'PATCH' && path.startsWith('/api/admin/users/')) {
      const u = await requireUser(req, res, sql, ['admin']);
      if (!u) return;
      const id = decodeURIComponent(path.split('/').pop());
      const b = await body(req);
      const rows = await sql`SELECT * FROM users WHERE id=${id} LIMIT 1`;
      const target = rows[0];
      if (!target) return json(res, 404, { ok: false, error: 'Không tìm thấy tài khoản.' });
      if (target.role === 'admin') return json(res, 400, { ok: false, error: 'Không khóa tài khoản admin bằng màn hình này.' });
      const status = b.status === 'active' ? 'active' : b.status === 'disabled' ? 'disabled' : target.status;
      const password = b.password ? hashPassword(String(b.password)) : target.password_hash;
      if (b.password && String(b.password).length < 6) return json(res, 400, { ok: false, error: 'Mật khẩu tối thiểu 6 ký tự.' });
      const updated = await sql`UPDATE users SET status=${status}, password_hash=${password} WHERE id=${id} RETURNING *`;
      return json(res, 200, { ok: true, user: safeUser(updated[0]) });
    }

    return json(res, 404, { ok: false, error: 'API endpoint not found' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { ok: false, error: e.message || 'Server error' });
  }
};

function mapAttempt(x) {
  if (!x) return null;
  return {
    id: x.id,
    createdAt: new Date(x.created_at).getTime(),
    examKey: x.exam_key,
    examName: x.exam_name,
    subjectKey: x.subject_key,
    subjectName: x.subject_name,
    score: Number(x.score) || 0,
    maxScore: Number(x.max_score) || 0,
    percent: Number(x.percent) || 0,
    correctCount: Number(x.correct_count) || 0,
    wrongCount: Number(x.wrong_count) || 0,
    unansweredCount: Number(x.unanswered_count) || 0,
    usedSeconds: Number(x.used_seconds) || 0,
    reason: x.reason,
    breakdown: x.breakdown || [],
    evaluations: x.evaluations || []
  };
}
