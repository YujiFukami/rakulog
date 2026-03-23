'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateJP, todayStr } from '@/lib/utils'
import type { WorkDay } from '@/types'
import { AlertCircle, CheckCircle, Wrench } from 'lucide-react'
import Link from 'next/link'

export default function ForgottenPage() {
  const supabase = createClient()
  const today = todayStr()
  const [workDays, setWorkDays] = useState<WorkDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 過去30日の勤務日を取得
      const from = new Date()
      from.setDate(from.getDate() - 30)
      const fromStr = from.toISOString().slice(0, 10)

      const { data } = await supabase
        .from('work_days')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', fromStr)
        .order('date', { ascending: false })

      setWorkDays(data || [])
      setLoading(false)
    }
    fetch()
  }, [supabase])

  const forgottenCount = workDays.filter(
    (d) => d.clock_in && !d.clock_out && d.date !== today
  ).length

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  }

  return (
    <div className="p-3 md:p-4 max-w-screen-md mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-800">退勤忘れ一覧</h2>
        {forgottenCount > 0 && (
          <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
            ⚠ {forgottenCount}件
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">日付</th>
              <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">出勤</th>
              <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">退勤</th>
              <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">状態</th>
              <th className="text-center py-2.5 px-3 text-xs font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {workDays.map((d) => {
              const isToday = d.date === today
              const isForgotten = d.clock_in && !d.clock_out && !isToday

              return (
                <tr key={d.work_day_id} className={`border-b border-gray-50 ${isForgotten ? 'bg-red-50' : ''}`}>
                  <td className="py-2.5 px-4 font-medium text-gray-800">
                    {formatDateJP(d.date)}
                    {isToday && <span className="ml-1 text-xs text-blue-500">（本日）</span>}
                  </td>
                  <td className="text-center py-2.5 px-3 text-gray-600 tabular-nums">
                    {d.clock_in ? d.clock_in.slice(0, 5) : '--:--'}
                  </td>
                  <td className="text-center py-2.5 px-3 text-gray-600 tabular-nums">
                    {d.clock_out ? d.clock_out.slice(0, 5) : '--:--'}
                  </td>
                  <td className="text-center py-2.5 px-3">
                    {isToday ? (
                      <span className="text-xs text-gray-400">本日</span>
                    ) : isForgotten ? (
                      <span className="flex items-center justify-center gap-1 text-xs text-red-600 font-medium">
                        <AlertCircle size={12} /> 退勤忘れ
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1 text-xs text-green-600">
                        <CheckCircle size={12} /> 正常
                      </span>
                    )}
                  </td>
                  <td className="text-center py-2.5 px-3">
                    {isForgotten ? (
                      <Link
                        href={`/forgotten/${d.date}`}
                        className="flex items-center justify-center gap-1 text-xs text-white bg-orange-500 hover:bg-orange-600 px-2 py-1 rounded-lg transition-colors"
                      >
                        <Wrench size={11} /> 修正する
                      </Link>
                    ) : (
                      <span className="text-xs text-gray-300">──</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {workDays.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-sm text-gray-400">
                  過去30日間の記録がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
