-- ==========================================
-- らくログ データベーススキーマ
-- Supabaseのダッシュボード > SQL Editor で実行してください
-- ==========================================

-- UUID拡張（Supabaseでは標準で有効）
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- テーブル作成
-- ==========================================

-- 勤務日テーブル
CREATE TABLE IF NOT EXISTS work_days (
  work_day_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  clock_in      TIME,
  clock_out     TIME,
  status        TEXT NOT NULL DEFAULT 'working'
                  CHECK (status IN ('working', 'finished', 'forgotten')),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

-- 作業履歴テーブル
CREATE TABLE IF NOT EXISTS work_history (
  history_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_day_id   UUID NOT NULL REFERENCES work_days(work_day_id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_name     TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  duration_sec  INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  input_method  TEXT NOT NULL DEFAULT 'list'
                  CHECK (input_method IN ('list', 'history', 'manual', 'clipboard')),
  note          TEXT
);

-- 作業マスタテーブル
CREATE TABLE IF NOT EXISTS task_master (
  task_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_name       TEXT NOT NULL,
  display_order   INTEGER NOT NULL DEFAULT 999,
  color           TEXT NOT NULL DEFAULT '#6B7280',
  exclude_summary BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (user_id, task_name)
);

-- 個人設定テーブル
CREATE TABLE IF NOT EXISTS user_settings (
  user_id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_start_task  TEXT NOT NULL DEFAULT '休憩',
  show_task_msg       BOOLEAN NOT NULL DEFAULT true,
  show_end_msg        BOOLEAN NOT NULL DEFAULT true,
  clipboard_auto      BOOLEAN NOT NULL DEFAULT false,
  lunch_start         TIME DEFAULT '12:00',
  lunch_end           TIME DEFAULT '13:00',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 修正履歴テーブル（将来拡張用）
CREATE TABLE IF NOT EXISTS edit_history (
  edit_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_table  TEXT NOT NULL,
  target_id     UUID NOT NULL,
  field_name    TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  edited_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT
);

-- ==========================================
-- インデックス
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_work_days_user_date ON work_days(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_work_history_work_day ON work_history(work_day_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_work_history_user ON work_history(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_master_user ON task_master(user_id, display_order);

-- ==========================================
-- Row Level Security (RLS)
-- ==========================================

ALTER TABLE work_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE edit_history ENABLE ROW LEVEL SECURITY;

-- work_days ポリシー
CREATE POLICY "work_days_user_policy" ON work_days
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- work_history ポリシー
CREATE POLICY "work_history_user_policy" ON work_history
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- task_master ポリシー
CREATE POLICY "task_master_user_policy" ON task_master
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_settings ポリシー
CREATE POLICY "user_settings_user_policy" ON user_settings
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- edit_history ポリシー
CREATE POLICY "edit_history_user_policy" ON edit_history
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==========================================
-- 関数：新規ユーザー登録時に初期データを自動作成
-- ==========================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 個人設定の初期化
  INSERT INTO user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- デフォルト作業マスタの登録
  INSERT INTO task_master (user_id, task_name, display_order, color, exclude_summary)
  VALUES
    (NEW.id, '開発',         1, '#3B82F6', false),
    (NEW.id, '事務',         2, '#10B981', false),
    (NEW.id, 'ブログ',       3, '#F59E0B', false),
    (NEW.id, '勉強',         4, '#8B5CF6', false),
    (NEW.id, '移動',         5, '#6B7280', true),
    (NEW.id, '休憩',         6, '#D1D5DB', true),
    (NEW.id, 'ミーティング', 7, '#EC4899', false)
  ON CONFLICT (user_id, task_name) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー：auth.usersに新規行が挿入されたとき
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
