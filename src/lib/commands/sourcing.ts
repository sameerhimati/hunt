import { Search } from 'lucide-react'

import { registerCommands } from './registry'

/**
 * Sourcing commands (Phase 5). Navigation only — saved searches live on the
 * /sourcing screen itself, not in the palette. Registered from `./index`,
 * like every other area.
 */
registerCommands('Sourcing', [
  {
    id: 'sourcing.open',
    label: 'Search for jobs',
    keywords: ['sourcing', 'boards', 'find', 'listings', 'jsearch', 'adzuna'],
    icon: Search,
    run: ({ navigate }) => navigate('/sourcing'),
  },
])
