import { CheckCircle2, Zap } from 'lucide-react'

import { registerCommands } from './registry'
import { getMostRecentApplication } from './server'

/** Tailoring commands (Phase 3). Owned by this file so the palette never changes. */
registerCommands('Tailoring', [
  {
    id: 'tailor.start-run',
    label: 'Start a tailor run',
    keywords: ['tailor', 'customize', 'tailor resume', 'job fit'],
    icon: Zap,
    run: async ({ navigate }) => {
      const applicationId = await getMostRecentApplication()
      if (applicationId) {
        navigate(`/applications/${applicationId}/tailor`)
      } else {
        navigate('/pipeline')
      }
    },
  },
  {
    id: 'tailor.run-checks',
    label: 'Run checks on this application',
    keywords: ['checks', 'verify', 'validation', 'fidelity', 'keywords'],
    icon: CheckCircle2,
    run: async ({ navigate }) => {
      const applicationId = await getMostRecentApplication()
      if (applicationId) {
        navigate(`/applications/${applicationId}`)
      } else {
        navigate('/pipeline')
      }
    },
  },
])
