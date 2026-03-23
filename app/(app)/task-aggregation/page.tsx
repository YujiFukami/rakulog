'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { secToStr, secToHHMM, colorToStyle } from '@/lib/utils'
import type { TaskMaster } from '@/types'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function MonthCalendar({
  year,
  month,
  calData,
  taskObj,
}: {
  year: number
  month: number
  calData: Record<number, number>
  taskObj: TaskMaster | undefined
}) {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">
        {year}年{month}月 ／ {taskObj?.task_name}
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
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const sec = calData[day] || 0
          const hasWork = sec > 0
          const bgColor = hasWork && taskObj ? colorToStyle(taskObj.color, 0.25) : undefined
          const borderColor = hasWork && taskObj ? colorToStyle(taskObj.color, 0.8) : undefined
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
                <div className="text-xs font-bold mt-1" style={{ color: taskObj?.color }}>
                  {secToHHMM(sec)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function TaskAggregationPage() {
  const supabase = createClient()
  const today = new Date()

  const [tasks, setTasks] = useState<TaskMaster[]>([])
  const [selectedTask, setSelectedTask] = useState('')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [allPeriod, setAllPeriod] = useState(false)
  const [unitPrice, setUnitPrice] = useState('')

  // 月別モード用
  const [calData, setCalData] = useState<Record<number, number>>({})
  // 全期間モード用: 'YYYY-MM' -> day -> seconds
  const [allCalData, setAllCalData] = useState<Record<string, Record<number, number>>>({})

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

      if (allPeriod) {
        // 全期間モード：全件取得して月別に集計
        const { data: hist } = await supabase
          .from('work_history')
          .select('started_at, duration_sec')
          .eq('user_id', user.id)
          .eq('task_name', selectedTask)
          .not('ended_at', 'is', null)
          .order('started_at')

        const monthMap: Record<string, Record<number, number>> = {}
        let total = 0
        for (const h of hist || []) {
          if (!h.duration_sec) continue
          const d = new Date(h.started_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (!monthMap[key]) monthMap[key] = {}
          const day = d.getDate()
          monthMap[key][day] = (monthMap[key][day] || 0) + h.duration_sec
          total += h.duration_sec
        }
        setAllCalData(monthMap)
        setTotalSec(total)
        setHasResult(true)
      } else {
        // 月別モード
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
      }
    } finally {
      setLoading(false)
    }
  }

  // 全期間の月リスト（時系列順）
  const allMonthKeys = Object.keys(allCalData).sort()

  // 月別モード用カレンダー
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

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

          {/* 全期間トグル */}
          <div className="flex items-center gap-2 mb-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${allPeriod ? 'bg-blue-600' : 'bg-gray-200'}`}
                onClick={() => setAllPeriod((v) => !v)}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${allPeriod ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm text-gray-700">全期間</span>
            </label>
          </div>

          {!allPeriod && (
            <>
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
            </>
          )}

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
            <div className="text-xs text-gray-400 mb-2">
              {allPeriod ? '全期間' : `${year}年${month}月`} ／ {selectedTask}
            </div>
            <div className="flex flex-wrap gap-4 items-start">
              <div className="text-center">
                <div className="text-xs text-gray-500 mb-0.5">合計時間</div>
                <div className="text-2xl font-bold text-gray-900">{secToHHMM(totalSec)}</div>
                <div className="text-xs text-gray-400">{secToStr(totalSec)}</div>
              </div>
              {allPeriod && (
                <div className="text-center">
                  <div className="text-xs text-gray-500 mb-0.5">対象月数</div>
                  <div className="text-2xl font-bold text-gray-900">{allMonthKeys.length}ヶ月</div>
                </div>
              )}
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

          {/* カレンダー表示 */}
          {allPeriod ? (
            // 全期間：月ごとにカレンダーを表示
            allMonthKeys.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">該当するデータがありません</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allMonthKeys.map((key) => {
                  const [y, m] = key.split('-').map(Number)
                  return (
                    <MonthCalendar
                      key={key}
                      year={y}
                      month={m}
                      calData={allCalData[key]}
                      taskObj={selectedTaskObj}
                    />
                  )
                })}
              </div>
            )
          ) : (
            // 月別：従来通り1ヶ月カレンダー
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
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
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
          )}
        </>
      )}

      {!hasResult && (
        <p className="text-sm text-gray-400 text-center py-8">条件を選択して「集計する」を押してください</p>
      )}
    </div>
  )
}
