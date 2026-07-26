'use client'

import {
  Columns3,
  FileText,
  LayoutDashboard,
  Mail,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { HuntMark } from '@/components/hunt-mark'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /**
   * Areas that land in a later phase render dimmed rather than 404ing. The
   * value is our own build vocabulary and stays internal — a stranger reading
   * "lands in Phase 5" learns nothing. Dropping the field is what un-dims a link.
   */
  comingIn?: string
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pipeline', label: 'Pipeline', icon: Columns3 },
  { href: '/sourcing', label: 'Sourcing', icon: Search },
  { href: '/resumes', label: 'Résumés', icon: FileText },
  { href: '/outreach', label: 'Outreach', icon: Mail },
]

const SETTINGS: NavItem = { href: '/settings', label: 'Settings', icon: SettingsIcon }

function railItemClass(active: boolean) {
  return cn(
    'relative flex size-9 items-center justify-center rounded-md transition-colors duration-150',
    active
      ? 'bg-surface-2 text-primary shadow-[inset_2px_0_0_var(--primary)]'
      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
  )
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon

  if (item.comingIn) {
    return (
      <span
        className="flex size-9 cursor-not-allowed items-center justify-center rounded-md text-faint"
        title={`${item.label} — not built yet`}
        aria-disabled="true"
      >
        <Icon size={17} aria-hidden="true" />
        <span className="sr-only">{`${item.label} — not built yet`}</span>
      </span>
    )
  }

  return (
    <Link href={item.href} className={railItemClass(active)} title={item.label}>
      <Icon size={17} aria-hidden="true" />
      <span className="sr-only">{item.label}</span>
    </Link>
  )
}

/**
 * Persistent left rail. hunt has ~7 top-level areas and is used in long focused
 * sessions, so a rail keeps them one click away and reads as a command center —
 * a topbar alone would bury navigation behind menus. See DESIGN.md §5.
 */
export function NavRail() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <nav
      aria-label="Main"
      className="flex w-[54px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-card py-4"
    >
      <Link href="/" className="mb-2.5 text-primary" title="hunt">
        <HuntMark />
        <span className="sr-only">hunt — home</span>
      </Link>

      {ITEMS.map((item) => (
        <RailLink key={item.href} item={item} active={isActive(item.href)} />
      ))}

      <div className="flex-1" />

      <RailLink item={SETTINGS} active={isActive(SETTINGS.href)} />
    </nav>
  )
}
