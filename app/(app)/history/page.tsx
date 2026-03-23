'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateJP, todayStr, toHHMM, secToStr, diffSec } from '@/lib/utils'
import type { WorkDay, WorkHistory, TaskMaster } from '@/types'
import { Pencil, X, AlertTriangle, Save, Calendar } from 'lucide-react'

interface EditingRow {
  history_id: string
  started_hhmm: string
  ended_hhmm: string | null
}

export default function HistoryPage() {
  const supabase = createClient()
  const today = todayStr()

  const [selectedDate, setSelectedDate] = useState(today)
  const [workDay, setWorkDay] = useState<WorkDay | null>(null)
  const [histories, setHistories] = useState<WorkHistory[]>([])
  const [tasks, setTasks] = useState<TaskMaster[]>([])
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [savedMsg, setSavedMsg] = useState('')

  const fetchDay = useCallback(async (date: string) => {
    setLoading(true)
    setEditingId(null)
    setEditingRow(null)
    setErrors([])
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: wd } = await supabase
        .from('work_days')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .single()

      setWorkDay(wd || null)

      if (wd) {
        const { data: hist } = await supabase
          .from('work_history')
          .select('*')
          .eq('work_day_id', wd.work_day_id)
          .order('sort_order')
        setHistories(hist || [])
      } else {
        setHistories([])
      }

      if (!tasksLoaded) {
        const { data: taskList } = await supabase
          .from('task_master')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('display_order')
        setTasks(taskList || [])
        setTasksLoaded(true)
      }
    } finally {
      setLoading(false)
    }
  }, [supabase, tasksLoaded])

  useState(() => { fetchDay(today) })

  const getTaskColor = (name: string) =>
    tasks.find(t => t.task_name === name)?.color || '#6B7280'

  const startEdit = (h: WorkHistory) => {
    setEditingId(h.history_id)
    setEditingRow({
      history_id: h.history_id,
      started_hhmm: toHHMM(h.started_at),
      ended_hhmm: h.ended_at ? toHHMM(h.ended_at) : null,
    })
    setErrors([])
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingRow(null)
    setErrors([])
  }

  // バリデーション
  const validate = (row: EditingRow): string[] => {
    const errs: string[] = []
    const target = histories.find(h => h.history_id === row.history_id)
    if (!target) return errs

    const idx = histories.indexOf(target)
    const dateStr = target.started_at.slice(0, 10)
    const newStart = new Date(`${dateStr}T${row.started_hhmm}:00`)

    if (isNaN(newStart.getTime())) {
      errs.push('開始時刻が正しくありません')
      return errs
    }

    if (row.ended_hhmm) {
      const newEnd = new Date(`${dateStr}T${row.ended_hhmm}:00`)
      if (newEnd <= newStart) {
        errs.push('終了時刻は開始時刻より後にしてください')
      }
      // 次の作業との整合性
      const next = histories[idx + 1]
      if (next) {
        const nextStart = new Date(next.started_at)
        if (newEnd > nextStart) {
          errs.push(`次の作業「${next.task_name}」の開始時刻（${toHHMM(next.started_at)}）より後になっています`)
        }
      }
    }

    // 前の作業との整合性（ただし自動更新されるので警告のみ）
    if (idx > 0) {
      const prev = histories[idx - 1]
      if (prev.started_at) {
        const prevStart = new Date(prev.started_at)
        if (newStart <= prevStart) {
          errs.push(`前の作業「${prev.task_name}」の開始時刻（${toHHMM(prev.started_at)}）より前か同じになっています`)
        }
      }
    }

    return errs
  }

  // 保存
  const handleSave = async () => {
    if (!editingRow || !workDay) return
    const errs = validate(editingRow)
    setErrors(errs)
    if (errs.length > 0) return

    setSaving(true)
    try {
      const target = histories.find(h => h.history_id === editingRow.history_id)
      if (!target) return

      const dateStr = target.started_at.slice(0, 10)
      const newStartedAt = new Date(`${dateStr}T${editingRow.started_hhmm}:00`).toISOString()
      const newEndedAt = editingRow.ended_hhmm
        ? new Date(`${dateStr}T${editingRow.ended_hhmm}:00`).toISOString()
        : null
      const newDurSec = newEndedAt ? diffSec(newStartedAt, newEndedAt) : null

      // 対象行を更新
      await supabase
        .from('work_history')
        .update({ started_at: newStartedAt, ended_at: newEndedAt, duration_sec: newDurSec })
        .eq('history_id', target.history_id)

      // 前の作業の終了時刻を自動更新（開始時刻に合わせる）
      const idx = histories.indexOf(target)
      if (idx > 0) {
        const prev = histories[idx - 1]
        const prevNewEndedAt = newStartedAt
        const prevNewDurSec = diffSec(prev.started_at, prevNewEndedAt)
        await supabase
          .from('work_history')
          .update({ ended_at: prevNewEndedAt, duration_sec: prevNewDurSec })
          .eq('history_id', prev.history_id)
      }

      setEditingId(null)
      setEditingRow(null)
      setSavedMsg('保存しました')
      setTimeout(() => setSavedMsg(''), 2500)
      await fetchDay(selectedDate)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 md:p-4 max-w-screen-md mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">作業履歴の編集</h2>

      {/* 保存メッセージ */}
      {savedMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg">
          {savedMsg}
        </div>
      )}

      {/* 日付選択 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={16} className="text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(e) => {
              if (!e.target.value) return
              setSelectedDate(e.target.value)
              fetchDay(e.target.value)
            }}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600 font-medium">{formatDateJP(selectedDate)}</span>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && !workDay && (
        <p className="text-sm text-gray-400 text-center py-8">この日の勤務記録がありません</p>
      )}

      {!loading && workDay && (
        <>
          {/* 出退勤時刻 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">打刻情報</h3>
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-xs text-gray-400">出勤</div>
                <div className="font-bold text-blue-700 text-base">{workDay.clock_in?.slice(0, 5) || '--:--'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">退勤</div>
                <div className="font-bold text-orange-700 text-base">{workDay.clock_out?.slice(0, 5) || '--:--'}</div>
              </div>
            </div>
          </div>

          {/* エラー表示 */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              {errors.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-red-600">
                  <AlertTriangle size={14} className="flex-shrink-0" /> {e}
                </div>
              ))}
            </div>
          )}

          {/* 作業履歴 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">作業履歴</h3>
            <div className="space-y-2">
              {histories.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">作業履歴がありません</p>
              )}
              {histories.map((h, idx) => {
                const isEditing = editingId === h.history_id
                const isActive = !h.ended_at
                const color = getTaskColor(h.task_name)
                const prevTask = idx > 0 ? histories[idx - 1] : null

                return (
                  <div
                    key={h.history_id}
                    className={`rounded-lg border p-3 transition-colors
                      ${isEditing ? 'border-blue-300 bg-blue-50' : isActive ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-white'}`}
                  >
                    {/* ヘッダー行 */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-gray-800 flex-1">{h.task_name}</span>
                      {isActive && (
                        <span className="text-xs text-orange-500 font-medium">進行中</span>
                      )}
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(h)}
                          disabled={!!editingId}
                          className="text-gray-400 hover:text-blue-600 transition-colors p-1 disabled:opacity-30"
                          title="この作業を編集"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>

                    {isEditing && editingRow ? (
                      /* 編集フォーム */
                      <div className="space-y-3">
                        <div className="flex items-end gap-4 flex-wrap">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">開始時刻</label>
                            <input
                              type="time"
                              value={editingRow.started_hhmm}
                              onChange={(e) => setEditingRow({ ...editingRow, started_hhmm: e.target.value })}
                              className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              終了時刻{isActive ? ' （進行中）' : ''}
                            </label>
                            <input
                              type="time"
                              value={editingRow.ended_hhmm || ''}
                              onChange={(e) => setEditingRow({ ...editingRow, ended_hhmm: e.target.value || null })}
                              disabled={isActive}
                              className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40 disabled:bg-gray-50"
                            />
                          </div>
                        </div>
                        {prevTask && (
                          <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1">
                            ※ 開始時刻を変更すると、前の作業「{prevTask.task_name}」の終了時刻も自動的に同じ時刻になります
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                          >
                            <Save size={12} /> {saving ? '保存中...' : '保存'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300"
                          >
                            <X size={12} /> キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 通常表示 */
                      <div className="flex gap-4 text-xs tabular-nums text-gray-500">
                        <span>
                          開始: <strong className="text-gray-700">{toHHMM(h.started_at)}</strong>
                        </span>
                        <span>
                          終了: <strong className={isActive ? 'text-orange-500' : 'text-gray-700'}>
                            {isActive ? '進行中' : toHHMM(h.ended_at)}
                          </strong>
                        </span>
                        {h.duration_sec != null && (
                          <span>
                            時間: <strong className="text-gray-700">{secToStr(h.duration_sec)}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
