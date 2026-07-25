import { dateRange, joinDefined, tex } from '../latex'
import type { ResumeContent } from '../schema'
import type { ResumeTemplate } from './types'

/**
 * Deedy — the dense two-column CV: a narrow left column for education, skills
 * and links, a wide right column for experience and projects. Rebuilt on stock
 * packages (the original ships a .cls plus Lato/Raleway) so it renders on a
 * machine with nothing installed.
 */

const PREAMBLE = String.raw`\documentclass[letterpaper,10pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.5in]{geometry}
\usepackage{xcolor}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\definecolor{deedyrule}{HTML}{444444}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\columnsep}{18pt}
\titleformat{\section}{\normalsize\bfseries\scshape\color{deedyrule}}{}{0em}{}[\vspace{-0.55em}{\color{deedyrule}\rule{\linewidth}{0.5pt}}\vspace{-0.3em}]
\titlespacing{\section}{0pt}{8pt}{3pt}
`

function bullets(items: string[], leftmargin = '1em'): string {
  if (items.length === 0) return ''
  return [
    `\\begin{itemize}[leftmargin=${leftmargin},itemsep=0.5pt,parsep=0pt,topsep=2pt]`,
    ...items.map((item) => `  \\item ${tex(item)}`),
    '\\end{itemize}',
  ].join('\n')
}

function leftColumn(content: ResumeContent): string[] {
  const body: string[] = []

  if (content.education.length > 0) {
    body.push('\\section{Education}')
    for (const school of content.education) {
      body.push(
        `\\textbf{${tex(school.institution)}} \\\\`,
        `{\\small ${tex(school.degree)}} \\\\`,
        `{\\small\\color{gray} ${dateRange(school.start, school.end)}}`,
        '\\vspace{5pt}',
        bullets(school.bullets),
      )
    }
  }

  if (content.skills.length > 0) {
    body.push('\\section{Skills}')
    for (const group of content.skills) {
      // The category label carries a colon rather than sitting on its own line:
      // in a 32%-wide column the label and the items wrap into each other, and
      // the colon is what keeps the grouping legible (to a reader and to the
      // import parser reading the extracted text back).
      body.push(
        `{\\small \\textbf{${tex(group.category)}:} ${group.items.map((item) => tex(item)).join(' $\\cdot$ ')}}`,
        '\\vspace{5pt}',
      )
    }
  }

  for (const section of content.custom) {
    body.push(`\\section{${tex(section.title)}}`, bullets(section.bullets))
  }

  return body
}

function rightColumn(content: ResumeContent): string[] {
  const body: string[] = []

  if (content.experience.length > 0) {
    body.push('\\section{Experience}')
    for (const job of content.experience) {
      body.push(
        `\\textbf{${tex(job.company)}} \\hfill {\\small\\color{gray} ${dateRange(job.start, job.end)}} \\\\`,
        `\\textit{${tex(job.title)}}${job.location ? ` \\hfill {\\small\\color{gray} ${tex(job.location)}}` : ''}`,
        bullets(job.bullets),
        '\\vspace{4pt}',
      )
    }
  }

  if (content.projects.length > 0) {
    body.push('\\section{Projects}')
    for (const project of content.projects) {
      body.push(
        `\\textbf{${tex(project.name)}}${project.url ? ` \\hfill {\\small\\texttt{${tex(project.url)}}}` : ''} \\\\`,
        project.description ? `{\\small ${tex(project.description)}}` : '',
        bullets(project.bullets),
        '\\vspace{4pt}',
      )
    }
  }

  return body
}

function render(content: ResumeContent): string {
  const { basics } = content
  const contact = joinDefined(
    [basics.email, basics.phone, basics.location, basics.url].map((part) => tex(part)),
    ' $\\cdot$ ',
  )

  const header = [
    '\\begin{center}',
    [
      `{\\Huge ${tex(basics.name)}}`,
      basics.label ? `{\\large\\scshape ${tex(basics.label)}}` : '',
      contact ? `{\\small ${contact}}` : '',
    ]
      .filter(Boolean)
      .join(' \\\\[3pt]\n'),
    '\\end{center}',
    basics.summary ? `\\vspace{2pt}\\small ${tex(basics.summary)}\\vspace{4pt}` : '',
  ]

  // A minipage pair rather than `multicols`: the columns are independent, and
  // the narrow/wide split is fixed by design rather than balanced by TeX.
  const columns = [
    '\\noindent',
    '\\begin{minipage}[t]{0.32\\linewidth}',
    ...leftColumn(content),
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{0.63\\linewidth}',
    ...rightColumn(content),
    '\\end{minipage}',
  ]

  return [
    PREAMBLE,
    '\\begin{document}',
    ...header.filter(Boolean),
    ...columns.filter(Boolean),
    '\\end{document}',
    '',
  ].join('\n')
}

export const deedy: ResumeTemplate = {
  id: 'deedy',
  name: 'Deedy',
  description: 'Dense two-column. Fits more on one page than anything else here.',
  source: PREAMBLE,
  render,
}
