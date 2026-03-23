'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { secToStr, secToHHMM, formatDateJP, getDayColorClass } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#EF4444','#6B7280','#14B8A6','#F97316','#84CC16']

export default function AggregationPage() {
  const supabase = createClient()
  const today = new Date()
  const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [startDate, setStartDate] = useState(firstDay)
  const [endDate, setEndDate] = useState(todayStr)
  const [loading, setLoading] = useState(false)

  // 集計結果
  const [taskTotals, setTaskTotals] = useState<{ task_name: string; total_sec: number }[]>([])
  const [crossTable, setCrossTable] = useState<{ date: string; [key: string]: string | number }[]>([])
  const [allDates, setAllDates] = useState<string[]>([])
  const [allTasks, setAllTasks] = useState<string[]>([])
  const [hasResult, setHasResult] = useState(false)

  const handleAggregate = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 集計除外作業を取得
      const { data: excludeTasks } = await supabase
        .from('task_master')
        .select('task_name')
        .eq('user_id', user.id)
        .eq('exclude_summary', true)
      const excludeNames = new Set((excludeTasks || []).map((t) => t.task_name))

      // 期間内の作業履歴を取得
      const { data: hist } = await supabase
        .from('work_history')
        .select('task_name, started_at, ended_at, duration_sec')
        .eq('user_id', user.id)
        .gte('started_at', `${startDate}T00:00:00`)
        .lte('started_at', `${endDate}T23:59:59`)
        .not('ended_at', 'is', null)

      if (!hist) return

      // 集計
      const taskMap: Record<string, number> = {}
      const dateTaskMap: Record<string, Record<string, number>> = {}
      const dateSet = new Set<string>()
      const taskSet = new Set<string>()

      for (const h of hist) {
        if (excludeNames.has(h.task_name)) continue
        if (!h.duration_sec) continue

        const date = h.started_at.slice(0, 10)
        dateSet.add(date)
        taskSet.add(h.task_name)
        taskMap[h.task_name] = (taskMap[h.task_name] || 0) + h.duration_sec
        if (!dateTaskMap[date]) dateTaskMap[date] = {}
        dateTaskMap[date][h.task_name] = (dateTaskMap[date][h.task_name] || 0) + h.duration_sec
      }

      const sortedDates = [...dateSet].sort()
      const sortedTasks = Object.entries(taskMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name)

      setAllDates(sortedDates)
      setAllTasks(sortedTasks)
      setTaskTotals(sortedTasks.map((name) => ({ task_name: name, total_sec: taskMap[name] })))

      const rows = sortedDates.map((date) => {
        const row: { date: string; [key: string]: string | number } = { date }
        for (const task of sortedTasks) {
          row[task] = dateTaskMap[date]?.[task] || 0
        }
        return row
      })
      setCrossTable(rows)
      setHasResult(true)
    } finally {
      setLoading(false)
    }
  }, [supabase, startDate, endDate])

  const totalSec = taskTotals.reduce((s, t) => s + t.total_sec, 0)

  const barData = crossTable.map((row) => ({
    date: row.date.slice(5),
    合計: Math.round(allTasks.reduce((s, t) => s + (Number(row[t]) || 0), 0) / 3600 * 10) / 10,
  }))

  const pieData = taskTotals.map((t) => ({
    name: t.task_name,
    value: Math.round(t.total_sec / 3600 * 10) / 10,
  }))

  return (
    <div className="p-3 md:p-4 max-w-screen-xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">集計</h2>

      {/* 期間指定 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">開始日</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <span className="text-gray-400 pb-1.5">〜</span>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">終了日</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAggregate}
            disabled={loading}
            className="pb-0 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? '集計中...' : '集計する'}
          </button>
        </div>
      </div>

      {!hasResult && (
        <p className="text-sm text-gray-400 text-center py-8">期間を選択して「集計する」を押してください</p>
      )}

      {hasResult && (
        <>
          {/* 作業名別合計 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">
              作業名別 合計時間　（総計: {secToStr(totalSec)}）
            </h3>
            <div className="space-y-2">
              {taskTotals.map((t, i) => (
                <div key={t.task_name} className="flex items-center gap-3">
                  <div className="w-20 text-xs text-gray-600 truncate text-right">{t.task_name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(t.total_sec / totalSec) * 100}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                  <div className="w-16 text-xs text-right text-gray-700 tabular-nums">{secToStr(t.total_sec)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* クロス集計表 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">日別 × 作業名 集計表</h3>
            <table className="text-xs min-w-max">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-500">日付</th>
                  {allTasks.map((t) => (
                    <th key={t} className="text-right py-1.5 px-2 font-medium text-gray-500 min-w-16">{t}</th>
                  ))}
                  <th className="text-right py-1.5 pl-3 font-medium text-gray-700">合計</th>
                </tr>
              </thead>
              <tbody>
                {crossTable.map((row) => {
                  const rowTotal = allTasks.reduce((s, t) => s + (Number(row[t]) || 0), 0)
                  return (
                    <tr key={row.date} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className={`py-1.5 pr-3 font-medium ${getDayColorClass(row.date)}`}>
                        {formatDateJP(row.date)}
                      </td>
                      {allTasks.map((t) => (
                        <td key={t} className="text-right px-2 text-gray-600 tabular-nums">
                          {Number(row[t]) > 0 ? secToHHMM(Number(row[t])) : ''}
                        </td>
                      ))}
                      <td className="text-right pl-3 font-medium text-gray-800 tabular-nums">
                        {rowTotal > 0 ? secToHHMM(rowTotal) : ''}
                      </td>
                    </tr>
                  )
                })}
                {/* 合計行 */}
                <tr className="border-t-2 border-gray-300 font-semibold bg-gray-50">
                  <td className="py-1.5 pr-3 text-gray-700">合計</td>
                  {allTasks.map((t) => (
                    <td key={t} className="text-right px-2 text-gray-800 tabular-nums">
                      {secToHHMM(taskTotals.find((x) => x.task_name === t)?.total_sec || 0)}
                    </td>
                  ))}
                  <td className="text-right pl-3 text-gray-900 tabular-nums">{secToHHMM(totalSec)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ダッシュボード */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 日別棒グラフ */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">日別 合計時間（時間）</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => [`${v}h`]} />
                  <Bar dataKey="合計" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 作業別円グラフ */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">作業別 構成比</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v}h`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* 作業別横棒グラフ */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">作業名別 合計時間（時間）</h3>
              <ResponsiveContainer width="100%" height={taskTotals.length * 36 + 20}>
                <BarChart
                  layout="vertical"
                  data={taskTotals.map((t, i) => ({ name: t.task_name, value: Math.round(t.total_sec / 3600 * 10) / 10, fill: COLORS[i % COLORS.length] }))}
                  margin={{ top: 0, right: 30, left: 60, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                  <Tooltip formatter={(v) => [`${v}h`]} />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                    {taskTotals.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
