// ==========================================
// 共通ユーティリティ関数
// ==========================================

/**
 * 秒数を "H時間MM分" 形式に変換
 */
export function secToStr(sec: number): string {
  if (sec <= 0) return '0分'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

/**
 * 秒数を "H:MM" 形式に変換（集計表示用）
 */
export function secToHHMM(sec: number): string {
  if (sec <= 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * ISO文字列を "HH:MM" に変換
 */
export function toHHMM(isoStr: string | null): string {
  if (!isoStr) return '--:--'
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * DATE文字列 (YYYY-MM-DD) を "M/D(曜)" に変換
 */
export function formatDateJP(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const days = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 2つのISO文字列の差分を秒で返す
 */
export function diffSec(start: string, end: string): number {
  return Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
}

/**
 * 曜日別クラス（土=青、日=赤）
 */
export function getDayColorClass(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDay()
  if (day === 0) return 'text-red-600'
  if (day === 6) return 'text-blue-600'
  return ''
}

/**
 * カラーコードからTailwindのbgクラスに変換（動的クラスはstyleで対応）
 */
export function colorToStyle(hex: string, alpha = 1): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`
}

/**
 * デフォルト作業マスタ（初期登録用）
 */
export const DEFAULT_TASKS = [
  { task_name: '開発', display_order: 1, color: '#3B82F6', exclude_summary: false },
  { task_name: '事務', display_order: 2, color: '#10B981', exclude_summary: false },
  { task_name: 'ブログ', display_order: 3, color: '#F59E0B', exclude_summary: false },
  { task_name: '勉強', display_order: 4, color: '#8B5CF6', exclude_summary: false },
  { task_name: '移動', display_order: 5, color: '#6B7280', exclude_summary: true },
  { task_name: '休憩', display_order: 6, color: '#D1D5DB', exclude_summary: true },
  { task_name: 'ミーティング', display_order: 7, color: '#EC4899', exclude_summary: false },
]
