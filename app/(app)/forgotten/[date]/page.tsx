'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateJP, secToStr, diffSec, toHHMM } from '@/lib/utils'
import type { WorkDay, WorkHistory } from '@/types'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'

export default function ForgottenEditPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = use(params)
  const supabase = createClient()
  const router = useRouter()

  const [workDay, setWorkDay] = useState<WorkDay | null>(null)
  const [histories, setHistories] = useState<WorkHistory[]>([])
  const [clockOut, setClockOut] = useState('')
  const [editingHistories, setEditingHistories] = useState<WorkHistory[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: wd } = await supabase
        .from('work_days')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', date)
        .single()

      setWorkDay(wd)
      setClockOut(wd?.clock_out?.slice(0, 5) || '')

      const { data: hist } = await supabase
        .from('work_history')
        .select('*')
        .eq('work_day_id', wd?.work_day_id)
        .order('sort_order')

      setHistories(hist || [])
      setEditingHistories(hist || [])
      setLoading(false)
    }
    fetch()
  }, [supabase, date])

  const updateHistory = (id: string, field: keyof WorkHistory, value: string) => {
    setEditingHistories((prev) =>
      prev.map((h) => h.history_id === id ? { ...h, [field]: value } : h)
    )
  }

  const validate = (): string[] => {
    const errs: string[] = []
    if (!clockOut) errs.push('退勤時刻を入力してください')
    if (workDay?.clock_in && clockOut) {
      if (clockOut <= workDay.clock_in.slice(0, 5)) {
        errs.push('退勤時刻は出勤時刻より後にしてください')
      }
    }
    for (const h of editingHistories) {
      if (h.ended_at) {
        const startTime = new Date(h.started_at)
        const endTime = new Date(h.ended_at)
        if (endTime <= startTime) {
          errs.push(`「${h.task_name}」の終了時刻は開始時刻より後にしてください`)
        }
      }
    }
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    setErrors(errs)
    if (errs.length > 0) return

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !workDay) return

      // 退勤時刻を更新
      await supabase
        .from('work_days')
        .update({ clock_out: `${clockOut}:00`, status: 'finished' })
        .eq('work_day_id', workDay.work_day_id)

      // 作業履歴を更新
      for (const h of editingHistories) {
        const dur = h.ended_at ? diffSec(h.started_at, h.ended_at) : null
        await supabase
          .from('work_history')
          .update({ ended_at: h.ended_at, duration_sec: dur })
          .eq('history_id', h.history_id)
      }

      router.push('/forgotten')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  }

  return (
    <div className="p-3 md:p-4 max-w-screen-md mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-800">
          {formatDateJP(date)} の修正
        </h2>
      </div>

      {/* 出退勤時刻 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">打刻情報</h3>
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">出勤時刻</label>
            <div className="text-base font-bold text-gray-800">
              {workDay?.clock_in?.slice(0, 5) || '--:--'}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">退勤時刻 ✏</label>
            <input
              type="time"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              className="border border-orange-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
        </div>
      </div>

      {/* 作業履歴 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">この日の作業履歴</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 pr-2 text-xs text-gray-500 font-medium">作業名</th>
                <th className="text-center py-2 px-2 text-xs text-gray-500 font-medium">開始時刻</th>
                <th className="text-center py-2 px-2 text-xs text-gray-500 font-medium">終了時刻 ✏</th>
                <th className="text-right py-2 pl-2 text-xs text-gray-500 font-medium">作業時間</th>
              </tr>
            </thead>
            <tbody>
              {editingHistories.map((h) => {
                const isActive = !h.ended_at
                const dur = h.ended_at ? secToStr(diffSec(h.started_at, h.ended_at)) : '---'
                return (
                  <tr key={h.history_id} className={`border-b border-gray-50 ${isActive ? 'bg-orange-50' : ''}`}>
                    <td className="py-2 pr-2 font-medium text-gray-800">{h.task_name}</td>
                    <td className="text-center py-2 px-2 text-gray-600 tabular-nums">{toHHMM(h.started_at)}</td>
                    <td className="text-center py-2 px-2">
                      {isActive ? (
                        <input
                          type="time"
                          value={h.ended_at ? new Date(h.ended_at).toTimeString().slice(0, 5) : ''}
                          onChange={(e) => {
                            const dateStr = h.started_at.slice(0, 10)
                            const newEnd = e.target.value ? `${dateStr}T${e.target.value}:00` : ''
                            updateHistory(h.history_id, 'ended_at', newEnd)
                          }}
                          className="border border-orange-300 rounded px-2 py-0.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      ) : (
                        <span className="text-gray-600 tabular-nums">{toHHMM(h.ended_at)}</span>
                      )}
                    </td>
                    <td className="text-right py-2 pl-2 text-gray-600 tabular-nums">
                      {isActive ? <span className="text-orange-500">要入力</span> : dur}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* エラー表示 */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          {errors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={14} /> {e}
            </div>
          ))}
        </div>
      )}

      {/* 保存ボタン */}
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? '保存中...' : '保存して確定'}
        </button>
      </div>
    </div>
  )
}
