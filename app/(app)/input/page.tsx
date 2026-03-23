'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toHHMM, formatDateJP, todayStr, secToStr, diffSec } from '@/lib/utils'
import type { WorkDay, WorkHistory, TaskMaster } from '@/types'
import { Clock, LogIn, LogOut, Square, Plus, Search, Star, Check, Pencil } from 'lucide-react'
import Link from 'next/link'

// ==========================================
// 入力画面（メイン）
// ==========================================

export default function InputPage() {
  const supabase = createClient()
  const today = todayStr()

  const [workDay, setWorkDay] = useState<WorkDay | null>(null)
  const [histories, setHistories] = useState<WorkHistory[]>([])
  const [tasks, setTasks] = useState<TaskMaster[]>([])
  const [recentTasks, setRecentTasks] = useState<string[]>([])
  const [taskSearch, setTaskSearch] = useState('')
  const [newTaskName, setNewTaskName] = useState('')
  const [mobileTab, setMobileTab] = useState<'recent' | 'list' | 'history'>('recent')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(new Date())
  const [confirmClockOut, setConfirmClockOut] = useState(false)

  // 現在時刻を1分ごとに更新
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // データ取得
  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // 今日の勤務日を取得（なければnull）
    const { data: wd } = await supabase
      .from('work_days')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    setWorkDay(wd)

    // 今日の作業履歴
    if (wd) {
      const { data: hist } = await supabase
        .from('work_history')
        .select('*')
        .eq('work_day_id', wd.work_day_id)
        .order('sort_order', { ascending: true })
      setHistories(hist || [])
    } else {
      setHistories([])
    }

    // 作業マスタ（有効なもの）
    const { data: taskList } = await supabase
      .from('task_master')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    setTasks(taskList || [])

    // 最近使った作業名（過去30件の履歴から重複除去）
    const { data: recentHist } = await supabase
      .from('work_history')
      .select('task_name, started_at')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(100)

    if (recentHist) {
      const seen = new Set<string>()
      const recent: string[] = []
      for (const h of recentHist) {
        if (!seen.has(h.task_name)) {
          seen.add(h.task_name)
          recent.push(h.task_name)
          if (recent.length >= 15) break
        }
      }
      setRecentTasks(recent)
    }

    setLoading(false)
  }, [supabase, today])

  useEffect(() => { fetchData() }, [fetchData])

  // 現在進行中の作業
  const activeHistory = histories.find((h) => !h.ended_at)

  // 進行中作業の現在経過時間
  const elapsedStr = activeHistory
    ? secToStr(diffSec(activeHistory.started_at, now.toISOString()))
    : null

  // showMessage
  const showMsg = (msg: string) => {
    setMessage(msg)
    setTimeout(() => setMessage(''), 3000)
  }

  // ---- 出勤 ----
  const handleClockIn = async () => {
    if (actionLoading || workDay?.clock_in) return
    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const nowISO = new Date().toISOString()
      const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:00`

      // 設定から出勤時開始作業名を取得
      const { data: settings } = await supabase
        .from('user_settings')
        .select('default_start_task')
        .eq('user_id', user.id)
        .single()
      const defaultTask = settings?.default_start_task || '休憩'

      // work_daysに出勤登録
      const { data: wd } = await supabase
        .from('work_days')
        .insert({ user_id: user.id, date: today, clock_in: timeStr, status: 'working' })
        .select()
        .single()

      if (wd) {
        // 最初の作業を自動登録
        await supabase.from('work_history').insert({
          work_day_id: wd.work_day_id,
          user_id: user.id,
          task_name: defaultTask,
          started_at: nowISO,
          sort_order: 1,
          input_method: 'list',
        })
      }
      showMsg(`出勤しました。「${defaultTask}」を開始します。`)
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  // ---- 退勤 ----
  const handleClockOut = async () => {
    if (actionLoading || !workDay) return
    // 既に退勤済みの場合は確認ダイアログを表示
    if (workDay.clock_out) {
      setConfirmClockOut(true)
      return
    }
    await doClockOut()
  }

  const doClockOut = async () => {
    if (!workDay) return
    setActionLoading(true)
    setConfirmClockOut(false)
    try {
      const nowISO = new Date().toISOString()
      const timeStr = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}:00`

      // 進行中作業を終了
      if (activeHistory) {
        const dur = diffSec(activeHistory.started_at, nowISO)
        await supabase
          .from('work_history')
          .update({ ended_at: nowISO, duration_sec: dur })
          .eq('history_id', activeHistory.history_id)
      }

      // 退勤時刻を保存（上書き）
      await supabase
        .from('work_days')
        .update({ clock_out: timeStr, status: 'finished' })
        .eq('work_day_id', workDay.work_day_id)

      showMsg('退勤しました。お疲れ様でした！')
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  // ---- 現在作業終了 ----
  const handleEndTask = async () => {
    if (actionLoading || !activeHistory) return
    setActionLoading(true)
    try {
      const nowISO = new Date().toISOString()
      const dur = diffSec(activeHistory.started_at, nowISO)
      await supabase
        .from('work_history')
        .update({ ended_at: nowISO, duration_sec: dur })
        .eq('history_id', activeHistory.history_id)
      showMsg(`「${activeHistory.task_name}」を終了しました。`)
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  // ---- 作業開始（切替） ----
  const handleStartTask = async (taskName: string, method: 'list' | 'history' | 'manual') => {
    if (actionLoading || !workDay) return
    setActionLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const nowISO = new Date().toISOString()

      // 退勤済みの場合は退勤時刻をクリアして作業中に戻す
      if (workDay.clock_out) {
        await supabase
          .from('work_days')
          .update({ clock_out: null, status: 'working' })
          .eq('work_day_id', workDay.work_day_id)
      }

      // 進行中作業を終了
      if (activeHistory) {
        const dur = diffSec(activeHistory.started_at, nowISO)
        await supabase
          .from('work_history')
          .update({ ended_at: nowISO, duration_sec: dur })
          .eq('history_id', activeHistory.history_id)
      }

      // 新しい作業を登録
      const nextOrder = histories.length + 1
      await supabase.from('work_history').insert({
        work_day_id: workDay.work_day_id,
        user_id: user.id,
        task_name: taskName,
        started_at: nowISO,
        sort_order: nextOrder,
        input_method: method,
      })

      setNewTaskName('')
      showMsg(`「${taskName}」を開始しました。`)
      await fetchData()
    } finally {
      setActionLoading(false)
    }
  }

  const handleNewTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskName.trim() || !workDay) return
    handleStartTask(newTaskName.trim(), 'manual')
  }

  const filteredTasks = tasks.filter((t) =>
    t.task_name.toLowerCase().includes(taskSearch.toLowerCase())
  )

  // ---- 作業マスタの色を取得 ----
  const getTaskColor = (name: string) => {
    const t = tasks.find((t) => t.task_name === name)
    return t?.color || '#6B7280'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="p-3 md:p-4 max-w-screen-xl mx-auto">
      {/* 退勤上書き確認ダイアログ */}
      {confirmClockOut && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-800">退勤時刻の上書き確認</h3>
            <p className="text-sm text-gray-600">
              既に退勤時刻が登録されています。<br />
              現在時刻で上書きしてよろしいですか？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmClockOut(false)}
                className="flex-1 py-2 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                いいえ
              </button>
              <button
                onClick={doClockOut}
                className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
              >
                はい・上書き
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト通知 */}
      {message && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-full text-sm shadow-lg">
          {message}
        </div>
      )}

      {/* 日付ヘッダー */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          {formatDateJP(today)}
        </h2>
        <div className="flex items-center gap-1 text-gray-500 text-sm">
          <Clock size={14} />
          {`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
        </div>
      </div>

      {/* PC: 3カラム / スマホ: 縦積み */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

        {/* ===== 左: 今日の状態 ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">今日の状態</h3>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">出勤</div>
              <div className="font-bold text-blue-700 text-base">
                {workDay?.clock_in ? workDay.clock_in.slice(0, 5) : '--:--'}
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">退勤</div>
              <div className="font-bold text-orange-700 text-base">
                {workDay?.clock_out ? workDay.clock_out.slice(0, 5) : '--:--'}
              </div>
            </div>
          </div>

          {/* 現在作業 */}
          {activeHistory && (
            <div className="rounded-lg border-2 p-2 text-sm" style={{ borderColor: getTaskColor(activeHistory.task_name) }}>
              <div className="text-xs text-gray-500 mb-0.5">進行中</div>
              <div className="font-bold text-gray-900">★ {activeHistory.task_name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {toHHMM(activeHistory.started_at)} 〜 ({elapsedStr})
              </div>
            </div>
          )}

          {/* ボタン群 */}
          <div className="space-y-2">
            <button
              onClick={handleClockIn}
              disabled={actionLoading || !!workDay?.clock_in}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors
                bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogIn size={16} />
              出勤
            </button>
            <button
              onClick={handleClockOut}
              disabled={actionLoading || !workDay}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors
                bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LogOut size={16} />
              退勤
            </button>
            <button
              onClick={handleEndTask}
              disabled={actionLoading || !activeHistory}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm transition-colors
                bg-gray-600 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Square size={16} />
              現在作業終了
            </button>
          </div>
        </div>

        {/* ===== 中: 今日の作業履歴 ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">今日の履歴</h3>
            <Link
              href={`/history?date=${today}`}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              <Pencil size={11} /> 時刻を修正
            </Link>
          </div>

          {histories.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">まだ作業がありません</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1 pr-2 text-xs text-gray-500 font-medium">作業名</th>
                    <th className="text-center py-1 px-1 text-xs text-gray-500 font-medium">開始</th>
                    <th className="text-center py-1 px-1 text-xs text-gray-500 font-medium">終了</th>
                    <th className="text-right py-1 pl-1 text-xs text-gray-500 font-medium">時間</th>
                  </tr>
                </thead>
                <tbody>
                  {histories.map((h) => {
                    const isActive = !h.ended_at
                    const durStr = h.duration_sec ? secToStr(h.duration_sec) : isActive ? '進行中' : '---'
                    return (
                      <tr
                        key={h.history_id}
                        className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors
                          ${isActive ? 'bg-blue-50' : ''}`}
                        onClick={() => !isActive && workDay && handleStartTask(h.task_name, 'history')}
                        title={isActive ? undefined : 'クリックで再開'}
                      >
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: getTaskColor(h.task_name) }}
                            />
                            <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                              {isActive ? '★ ' : ''}{h.task_name}
                            </span>
                          </div>
                        </td>
                        <td className="text-center px-1 text-gray-500 tabular-nums">{toHHMM(h.started_at)}</td>
                        <td className="text-center px-1 text-gray-500 tabular-nums">{toHHMM(h.ended_at)}</td>
                        <td className="text-right pl-1 text-gray-600 tabular-nums">
                          {isActive ? (
                            <span className="text-blue-600 font-medium">{elapsedStr}</span>
                          ) : (
                            durStr
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ===== 右: 作業選択パネル ===== */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">作業を選択</h3>

          {/* スマホ用タブ（PCでは非表示） */}
          <div className="flex md:hidden border-b border-gray-100 mb-3 -mx-4 px-4">
            {(['recent', 'list', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors
                  ${mobileTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              >
                {tab === 'recent' ? '最近(15件)' : tab === 'list' ? '一覧' : '今日の履歴'}
              </button>
            ))}
          </div>

          {/* 最近の作業（PC: 常時表示, スマホ: recentタブ） */}
          <div className={`${mobileTab !== 'recent' ? 'hidden md:block' : ''}`}>
            <div className="flex items-center gap-1 mb-2">
              <Star size={13} className="text-yellow-500" />
              <span className="text-xs font-medium text-gray-600">最近の作業</span>
            </div>
            <div className="space-y-1 mb-3">
              {recentTasks.length === 0 && (
                <p className="text-xs text-gray-400 py-2">作業履歴がありません</p>
              )}
              {recentTasks.map((name) => {
                const isActive = activeHistory?.task_name === name
                return (
                  <button
                    key={name}
                    onClick={() => !isActive && workDay && handleStartTask(name, 'list')}
                    disabled={actionLoading || !workDay || isActive}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors
                      ${isActive
                        ? 'bg-blue-100 text-blue-700 cursor-default font-medium'
                        : 'hover:bg-gray-50 text-gray-700 disabled:opacity-50'
                      }`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getTaskColor(name) }}
                    />
                    {isActive ? <><Star size={12} className="text-blue-500" /> {name}</> : name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 全作業一覧（PC: 常時表示, スマホ: listタブ） */}
          <div className={`${mobileTab !== 'list' ? 'hidden md:block' : ''}`}>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="作業を検索..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto mb-3">
              {filteredTasks.map((t) => {
                const isActive = activeHistory?.task_name === t.task_name
                return (
                  <button
                    key={t.task_id}
                    onClick={() => !isActive && workDay && handleStartTask(t.task_name, 'list')}
                    disabled={actionLoading || !workDay || isActive}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-left transition-colors
                      ${isActive
                        ? 'bg-blue-100 text-blue-700 cursor-default'
                        : 'hover:bg-gray-50 text-gray-700 disabled:opacity-50'
                      }`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.task_name}
                    {isActive && <Check size={12} className="ml-auto text-blue-500" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 新規作業入力 */}
          {(!workDay || mobileTab !== 'history') && (
            <form onSubmit={handleNewTaskSubmit} className="flex gap-2 mt-2">
              <div className="flex items-center gap-1 flex-1 border border-gray-200 rounded-lg px-2 focus-within:ring-1 focus-within:ring-blue-500">
                <Plus size={13} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  placeholder="新規作業名"
                  className="flex-1 py-1.5 text-xs outline-none"
                  disabled={!workDay}
                />
              </div>
              <button
                type="submit"
                disabled={actionLoading || !workDay || !newTaskName.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                開始
              </button>
            </form>
          )}

          {!workDay && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              ※ 出勤後に作業を選択できます
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
