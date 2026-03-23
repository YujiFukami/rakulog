'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { secToStr, secToHHMM, colorToStyle } from '@/lib/utils'
import type { TaskMaster } from '@/types'

export default function TaskAggregationPage() {
  const supabase = createClient()
  const today = new Date()

  const [tasks, setTasks] = useState<TaskMaster[]>([])
  const [selectedTask, setSelectedTask] = useState('')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [unitPrice, setUnitPrice] = useState('')
  const [calData, setCalData] = useState<Record<number, number>>({})  // day → seconds
  const [totalSec, setTotalSec] = useState(0)
  const [hasResult, setHasResult] = useState(false)
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const init = useCallback(async () => {
    if (initialized) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('task_master')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('display_order')
    setTasks(data || [])
    if (data && data.length > 0) setSelectedTask(data[0].task_name)
    setInitialized(true)
  }, [supabase, initialized])

  useState(() => { init() })

  const selectedTaskObj = tasks.find((t) => t.task_name === selectedTask)

  const handleAggregate = async () => {
    if (!selectedTask) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const startISO = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`
      const endDate = new Date(year, month, 0)
      const endISO = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59`

      const { data: hist } = await supabase
        .from('work_history')
        .select('started_at, duration_sec')
        .eq('user_id', user.id)
        .eq('task_name', selectedTask)
        .gte('started_at', startISO)
        .lte('started_at', endISO)
        .not('ended_at', 'is', null)

      const dayMap: Record<number, number> = {}
      let total = 0
      for (const h of hist || []) {
        if (!h.duration_sec) continue
        const day = new Date(h.started_at).getDate()
        dayMap[day] = (dayMap[day] || 0) + h.duration_sec
        total += h.duration_sec
      }
      setCalData(dayMap)
      setTotalSec(total)
      setHasResult(true)
    } finally {
      setLoading(false)
    }
  }

  // カレンダー生成
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay() // 0=日
  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  const amount = unitPrice
    ? Math.round((totalSec / 3600) * parseFloat(unitPrice))
    : null

  return (
    <div className="p-3 md:p-4 max-w-screen-lg mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">特定作業集計</h2>

      {/* 条件指定 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">対象作業名</label>
            <select
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {tasks.map((t) => (
                <option key={t.task_id} value={t.task_name}>{t.task_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">年</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">月</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAggregate}
            disabled={loading || !selectedTask}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? '集計中...' : '集計する'}
          </button>
        </div>
      </div>

      {hasResult && (
        <>
          {/* サマリー */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-4 items-start">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-0.5">合計時間</div>
                <div className="text-2xl font-bold text-gray-900">{secToHHMM(totalSec)}</div>
                <div className="text-xs text-gray-400">{secToStr(totalSec)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">単価（円/h）※任意</div>
                <input
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="例: 6000"
                  className="border border-gray-200 rounded-lg px-3 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {amount !== null && (
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">金額（概算）</div>
                  <div className="text-2xl font-bold text-green-700">¥{amount.toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>

          {/* カレンダー */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              {year}年{month}月 ／ {selectedTask}
            </h3>
            <div className="grid grid-cols-7 gap-1">
              {DAY_LABELS.map((d, i) => (
                <div
                  key={d}
                  className={`text-center text-xs font-medium py-1
                    ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}
                >
                  {d}
                </div>
              ))}
              {/* 空セル */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* 日付セル */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const sec = calData[day] || 0
                const hasWork = sec > 0
                const bgColor = hasWork && selectedTaskObj
                  ? colorToStyle(selectedTaskObj.color, 0.25)
                  : undefined
                const borderColor = hasWork && selectedTaskObj
                  ? colorToStyle(selectedTaskObj.color, 0.8)
                  : undefined
                const dow = new Date(year, month - 1, day).getDay()
                return (
                  <div
                    key={day}
                    className={`rounded-lg p-1.5 min-h-14 text-center border
                      ${hasWork ? 'border' : 'border-gray-100'}
                      ${dow === 0 ? 'text-red-600' : dow === 6 ? 'text-blue-600' : 'text-gray-700'}
                    `}
                    style={{
                      backgroundColor: bgColor,
                      borderColor: hasWork ? borderColor : undefined,
                    }}
                  >
                    <div className="text-xs font-medium">{day}</div>
                    {hasWork && (
                      <div className="text-xs font-bold mt-1" style={{ color: selectedTaskObj?.color }}>
                        {secToHHMM(sec)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {!hasResult && (
        <p className="text-sm text-gray-400 text-center py-8">条件を選択して「集計する」を押してください</p>
      )}
    </div>
  )
}
