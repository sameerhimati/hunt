import { Mail } from 'lucide-react'

import { registerCommands } from './registry'

/** Outreach commands (Phase 4). */
registerCommands('Outreach', [
  {
    id: 'outreach.open',
    label: 'Go to Outreach',
    keywords: ['email', 'follow-up', 'sequence', 'contacts'],
    icon: Mail,
    run: ({ navigate }) => navigate('/outreach'),
  },
  {
    id: 'outreach.due-today',
    label: 'Follow-ups due today',
    keywords: ['due', 'nudge', 'queue'],
    icon: Mail,
    run: ({ navigate }) => navigate('/outreach'),
  },
])
