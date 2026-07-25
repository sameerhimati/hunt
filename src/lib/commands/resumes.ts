import { FileText, Upload } from 'lucide-react'

import { registerCommands } from './registry'

/** Résumé commands (Phase 1). Owned by this file so the palette never changes. */
registerCommands('Résumés', [
  {
    id: 'resumes.index',
    label: 'Go to Résumés',
    keywords: ['cv', 'versions', 'editor', 'latex'],
    icon: FileText,
    run: ({ navigate }) => navigate('/resumes'),
  },
  {
    id: 'resumes.import',
    label: 'Import a résumé PDF',
    keywords: ['upload', 'parse', 'pdf'],
    icon: Upload,
    run: ({ navigate }) => navigate('/resumes/import'),
  },
])
