'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TaskMaster, UserSettings } from '@/types'
import { DEFAULT_TASKS } from '@/lib/utils'
import { Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react'

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
  '#EF4444', '#6B7280', '#14B8A6', '#F97316', '#84CC16',
]

export default function SettingsPage() {
  const supabase = createClient()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [tasks, setTasks] = useState<TaskMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 作業マスタ編集用
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ task_name: '', color: '#6B7280', exclude_summary: false })
  const [newTaskForm, setNewTaskForm] = useState({ task_name: '', color: '#3B82F6', exclude_summary: false })
  const [showNewForm, setShowNewForm] = useState(false)

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: s } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (s) {
      setSettings(s)
    } else {
      // 設定がなければ初期データを作成
      await supabase.from('user_settings').insert({ user_id: user.id })
      const { data: newS } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
      setSettings(newS)
    }

    const { data: taskList } = await supabase
      .from('task_master')
      .select('*')
      .eq('user_id', user.id)
      .order('display_order')

    // 初回：デフォルト作業マスタを登録
    if (!taskList || taskList.length === 0) {
      const defaults = DEFAULT_TASKS.map((t) => ({ ...t, user_id: user.id }))
      await supabase.from('task_master').insert(defaults)
      const { data: newList } = await supabase.from('task_master').select('*').eq('user_id', user.id).order('display_order')
      setTasks(newList || [])
    } else {
      setTasks(taskList)
    }

    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const handleSaveSettings = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase
        .from('user_settings')
        .upsert({ ...settings, user_id: user.id, updated_at: new Date().toISOString() })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  // 作業マスタ追加
  const handleAddTask = async () => {
    if (!newTaskForm.task_name.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.display_order)) : 0
    await supabase.from('task_master').insert({
      user_id: user.id,
      task_name: newTaskForm.task_name.trim(),
      display_order: maxOrder + 1,
      color: newTaskForm.color,
      exclude_summary: newTaskForm.exclude_summary,
      is_active: true,
    })
    setNewTaskForm({ task_name: '', color: '#3B82F6', exclude_summary: false })
    setShowNewForm(false)
    await fetchData()
  }

  // 作業マスタ更新
  const handleUpdateTask = async (taskId: string) => {
    await supabase
      .from('task_master')
      .update({ task_name: editForm.task_name, color: editForm.color, exclude_summary: editForm.exclude_summary })
      .eq('task_id', taskId)
    setEditingId(null)
    await fetchData()
  }

  // 作業マスタ削除（無効化）
  const handleToggleTask = async (task: TaskMaster) => {
    await supabase
      .from('task_master')
      .update({ is_active: !task.is_active })
      .eq('task_id', task.task_id)
    await fetchData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
  }

  return (
    <div className="p-3 md:p-4 max-w-screen-md mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">設定</h2>

      {/* 基本設定 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">基本設定</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">出勤時開始作業名</label>
          <select
            value={settings?.default_start_task || '休憩'}
            onChange={(e) => settings && setSettings({ ...settings, default_start_task: e.target.value })}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {tasks.filter((t) => t.is_active).map((t) => (
              <option key={t.task_id} value={t.task_name}>{t.task_name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">昼休み 開始</label>
            <input
              type="time"
              value={settings?.lunch_start || '12:00'}
              onChange={(e) => settings && setSettings({ ...settings, lunch_start: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">昼休み 終了</label>
            <input
              type="time"
              value={settings?.lunch_end || '13:00'}
              onChange={(e) => settings && setSettings({ ...settings, lunch_end: e.target.value })}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* 表示設定 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">表示設定</h3>

        {([
          { key: 'show_task_msg', label: '作業登録メッセージを表示' },
          { key: 'show_end_msg', label: '作業終了メッセージを表示' },
          { key: 'clipboard_auto', label: 'クリップボード自動入力' },
        ] as const).map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-gray-700">{label}</span>
            <div
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${settings?.[key] ? 'bg-blue-600' : 'bg-gray-200'}`}
              onClick={() => settings && setSettings({ ...settings, [key]: !settings[key] })}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${settings?.[key] ? 'translate-x-6' : 'translate-x-1'}`} />
            </div>
          </label>
        ))}
      </div>

      {/* 設定保存ボタン */}
      <button
        onClick={handleSaveSettings}
        disabled={saving}
        className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors
          ${saved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}
          disabled:opacity-50`}
      >
        {saved ? '✓ 保存しました' : saving ? '保存中...' : '設定を保存'}
      </button>

      {/* 作業マスタ管理 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
          <h3 className="text-sm font-semibold text-gray-700">作業マスタ管理</h3>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus size={13} /> 作業を追加
          </button>
        </div>

        {/* 新規追加フォーム */}
        {showNewForm && (
          <div className="bg-blue-50 rounded-lg p-3 mb-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTaskForm.task_name}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, task_name: e.target.value })}
                placeholder="作業名"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="flex gap-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewTaskForm({ ...newTaskForm, color: c })}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110
                      ${newTaskForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={newTaskForm.exclude_summary}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, exclude_summary: e.target.checked })}
                className="rounded"
              />
              集計から除外する
            </label>
            <div className="flex gap-2">
              <button onClick={handleAddTask} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">追加</button>
              <button onClick={() => setShowNewForm(false)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300">キャンセル</button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {tasks.map((task) => (
            <div
              key={task.task_id}
              className={`flex items-center gap-2 p-2 rounded-lg ${task.is_active ? '' : 'opacity-50 bg-gray-50'}`}
            >
              <GripVertical size={14} className="text-gray-300 flex-shrink-0" />
              <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: task.color }} />

              {editingId === task.task_id ? (
                // 編集中
                <div className="flex-1 flex gap-2 items-center">
                  <input
                    type="text"
                    value={editForm.task_name}
                    onChange={(e) => setEditForm({ ...editForm, task_name: e.target.value })}
                    className="flex-1 border border-blue-300 rounded px-2 py-0.5 text-sm focus:outline-none"
                  />
                  <div className="flex gap-0.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditForm({ ...editForm, color: c })}
                        className={`w-4 h-4 rounded-full border ${editForm.color === c ? 'border-gray-700' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={editForm.exclude_summary}
                      onChange={(e) => setEditForm({ ...editForm, exclude_summary: e.target.checked })}
                      className="rounded"
                    />
                    集計除外
                  </label>
                  <button onClick={() => handleUpdateTask(task.task_id)} className="text-green-600 hover:text-green-700"><Check size={14} /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </div>
              ) : (
                // 表示中
                <>
                  <span className={`flex-1 text-sm ${task.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                    {task.task_name}
                  </span>
                  {task.exclude_summary && (
                    <span className="text-xs text-gray-400 bg-gray-100 rounded px-1">集計除外</span>
                  )}
                  <button
                    onClick={() => {
                      setEditingId(task.task_id)
                      setEditForm({ task_name: task.task_name, color: task.color, exclude_summary: task.exclude_summary })
                    }}
                    className="text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleToggleTask(task)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title={task.is_active ? '無効化' : '有効化'}
                  >
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
