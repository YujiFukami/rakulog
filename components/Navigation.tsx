'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ClipboardList,
  BarChart2,
  BookOpen,
  Settings,
  AlertCircle,
  LogOut,
  History,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/input',            label: '入力',     icon: ClipboardList },
  { href: '/aggregation',      label: '集計',     icon: BarChart2 },
  { href: '/task-aggregation', label: '特定作業', icon: BookOpen },
  { href: '/history',          label: '履歴編集', icon: History },
  { href: '/forgotten',        label: '退勤忘れ', icon: AlertCircle },
  { href: '/settings',         label: '設定',     icon: Settings },
]

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* PC用ヘッダー */}
      <header className="hidden md:flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-600">🗒 らくログ</span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${pathname.startsWith(href)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors ml-2"
          >
            <LogOut size={15} />
            ログアウト
          </button>
          <a
            href="https://www.softex-celware.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-3 pl-3 border-l border-gray-200 flex items-center hover:opacity-80 transition-opacity"
            title="Softex-Celware 公式サイト"
          >
            <Image
              src="/softex-celware-logo.png"
              alt="Softex-Celware"
              width={160}
              height={44}
              className="h-11 w-auto object-contain"
            />
          </a>
        </nav>
      </header>

      {/* スマホ用ボトムナビ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-10">
        <div className="flex">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors
                ${pathname.startsWith(href)
                  ? 'text-blue-600'
                  : 'text-gray-500'
                }`}
            >
              <Icon size={20} />
              <span className="mt-0.5">{label}</span>
            </Link>
          ))}
        </div>
        <div className="flex justify-end pr-3 pb-1">
          <a
            href="https://www.softex-celware.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
          >
            Powered by Softex-Celware
          </a>
        </div>
      </nav>
    </>
  )
}
