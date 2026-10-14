-- My Exam Web V6 — Neon PostgreSQL schema
-- API tự chạy CREATE TABLE IF NOT EXISTS, file này để tham khảo / backup.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  status TEXT NOT NULL DEFAULT 'active',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS attempts (
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
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_created ON attempts(user_id, created_at DESC);

-- Bảng lưu trữ đề thi trực tiếp trên Web (Admin tạo mới hoặc chỉnh sửa trực tiếp không cần sửa JSON trên GitHub)
CREATE TABLE IF NOT EXISTS exam_papers (
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
);

CREATE INDEX IF NOT EXISTS idx_exam_papers_lookup ON exam_papers(exam_key, subject_key, is_deleted, updated_at DESC);
