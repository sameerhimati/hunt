import { LayoutDashboard, Settings, SunMoon } from 'lucide-react'

import { registerCommands } from './registry'

/**
 * Commands that exist regardless of which phases have shipped. Each area
 * registers its own "go to" command in its own file as it lands — listing them
 * here would put dead links in the palette for screens that 404.
 */
registerCommands('Navigate', [
  {
    id: 'core.dashboard',
    label: 'Go to Dashboard',
    keywords: ['home', 'funnel', 'activity'],
    icon: LayoutDashboard,
    run: ({ navigate }) => navigate('/'),
  },
  {
    id: 'core.settings',
    label: 'Go to Settings',
    keywords: ['keys', 'providers', 'api', 'byok'],
    icon: Settings,
    run: ({ navigate }) => navigate('/settings'),
  },
])

registerCommands('General', [
  {
    id: 'core.toggle-theme',
    label: 'Toggle theme',
    keywords: ['dark', 'light', 'appearance'],
    icon: SunMoon,
    run: ({ toggleTheme }) => toggleTheme(),
  },
])
