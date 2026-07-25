import { Columns3, Rows3 } from 'lucide-react'

import { registerCommands } from './registry'

/** Pipeline commands (Phase 2). */
registerCommands('Pipeline', [
  {
    id: 'pipeline.board',
    label: 'Go to Pipeline',
    keywords: ['board', 'kanban', 'applications', 'tracker'],
    icon: Columns3,
    run: ({ navigate }) => navigate('/pipeline'),
  },
  {
    id: 'pipeline.table',
    label: 'Pipeline as a table',
    keywords: ['list', 'dense', 'triage'],
    icon: Rows3,
    run: ({ navigate }) => navigate('/pipeline?view=table'),
  },
])
