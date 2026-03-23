// ==========================================
// らくログ 共通型定義
// ==========================================

export type WorkDayStatus = 'working' | 'finished' | 'forgotten'
export type InputMethod = 'list' | 'history' | 'manual' | 'clipboard'

// ユーザー
export interface User {
  user_id: string
  email: string
  username: string
  auth_provider: string
  created_at: string
}

// 勤務日
export interface WorkDay {
  work_day_id: string
  user_id: string
  date: string          // YYYY-MM-DD
  clock_in: string | null   // HH:MM:SS
  clock_out: string | null  // HH:MM:SS
  status: WorkDayStatus
  updated_at: string
}

// 作業履歴
export interface WorkHistory {
  history_id: string
  work_day_id: string
  task_name: string
  started_at: string        // ISO8601
  ended_at: string | null   // ISO8601 / null = 進行中
  duration_sec: number | null
  sort_order: number
  input_method: InputMethod
  note: string | null
}

// 作業マスタ
export interface TaskMaster {
  task_id: string
  user_id: string
  task_name: string
  display_order: number
  color: string             // 例: #3B82F6
  exclude_summary: boolean
  is_active: boolean
}

// 個人設定
export interface UserSettings {
  user_id: string
  default_start_task: string
  show_task_msg: boolean
  show_end_msg: boolean
  clipboard_auto: boolean
  lunch_start: string | null  // HH:MM
  lunch_end: string | null    // HH:MM
}

// 修正履歴
export interface EditHistory {
  edit_id: string
  target_table: string
  target_id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  edited_at: string
  reason: string | null
}

// ==========================================
// UI用の複合型
// ==========================================

// 作業履歴（表示用・作業時間を文字列で持つ）
export interface WorkHistoryDisplay extends WorkHistory {
  duration_str: string    // "2時間15分" など
  is_active: boolean      // 進行中かどうか
}

// 退勤忘れ一覧表示用
export interface ForgottenClockout {
  work_day_id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  is_today: boolean
}

// 集計結果
export interface AggregationRow {
  task_name: string
  total_sec: number
  total_str: string
  daily: Record<string, number>  // { "2026-03-01": 3600, ... }
}

// 特定作業の日別集計
export interface TaskDaySummary {
  date: string
  total_sec: number
  total_str: string
}
