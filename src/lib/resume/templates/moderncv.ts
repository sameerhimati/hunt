import { dateRange, joinDefined, tex } from '../latex'
import type { ResumeContent } from '../schema'
import type { ResumeTemplate } from './types'

/**
 * moderncv "classic" — the two-column look where dates sit in a left gutter
 * beside each entry. Reimplemented on stock packages rather than the moderncv
 * class: the class drags in a font/icon stack that Tectonic would have to fetch
 * on every cold machine, and we only need the layout.
 */

const ACCENT = '\\definecolor{accent}{HTML}{2C6EAB}'

const PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.7in]{geometry}
\usepackage{xcolor}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
${ACCENT}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\titleformat{\section}{\large\bfseries\color{accent}}{}{0em}{}[\vspace{-0.5em}{\color{accent}\rule{\linewidth}{1.2pt}}\vspace{-0.2em}]
\titlespacing{\section}{0pt}{11pt}{5pt}
% Dates live in a fixed left gutter; the entry body hangs beside them.
\newcommand{\gutterentry}[2]{%
  \noindent\begin{minipage}[t]{0.20\linewidth}\raggedright\small\color{gray}#1\end{minipage}%
  \hfill\begin{minipage}[t]{0.78\linewidth}#2\end{minipage}\par\vspace{4pt}}
`

function bullets(items: string[]): string {
  if (items.length === 0) return ''
  return [
    '\\begin{itemize}[leftmargin=1.1em,itemsep=1pt,parsep=0pt,topsep=2pt]',
    ...items.map((item) => `  \\item ${tex(item)}`),
    '\\end{itemize}',
  ].join('\n')
}

function render(content: ResumeContent): string {
  const { basics } = content
  const contact = joinDefined(
    [basics.email, basics.phone, basics.location, basics.url].map((part) => tex(part)),
    ' \\textbar{} ',
  )

  const body: string[] = [
    `{\\Huge\\bfseries\\color{accent} ${tex(basics.name)}}`,
    basics.label ? `\\\\[3pt] {\\large ${tex(basics.label)}}` : '',
    contact ? `\\\\[3pt] {\\small ${contact}}` : '',
    '\\vspace{4pt}',
  ]

  if (basics.summary) body.push('\\section{Profile}', tex(basics.summary))

  if (content.experience.length > 0) {
    body.push('\\section{Experience}')
    for (const job of content.experience) {
      const heading = [
        `\\textbf{${tex(job.title)}}, ${tex(job.company)}`,
        job.location ? `\\\\ {\\small\\color{gray} ${tex(job.location)}}` : '',
        bullets(job.bullets),
      ]
        .filter(Boolean)
        .join('\n')
      body.push(`\\gutterentry{${dateRange(job.start, job.end)}}{${heading}}`)
    }
  }

  if (content.education.length > 0) {
    body.push('\\section{Education}')
    for (const school of content.education) {
      const heading = [
        `\\textbf{${tex(school.degree)}}${school.degree ? ', ' : ''}${tex(school.institution)}`,
        bullets(school.bullets),
      ]
        .filter(Boolean)
        .join('\n')
      body.push(`\\gutterentry{${dateRange(school.start, school.end)}}{${heading}}`)
    }
  }

  if (content.skills.length > 0) {
    body.push('\\section{Skills}')
    for (const group of content.skills) {
      body.push(`\\gutterentry{${tex(group.category)}}{${group.items.map((item) => tex(item)).join(', ')}}`)
    }
  }

  if (content.projects.length > 0) {
    body.push('\\section{Projects}')
    for (const project of content.projects) {
      const heading = [
        `\\textbf{${tex(project.name)}}${project.description ? ` --- ${tex(project.description)}` : ''}`,
        bullets(project.bullets),
      ]
        .filter(Boolean)
        .join('\n')
      body.push(`\\gutterentry{${project.url ? `{\\small\\texttt{${tex(project.url)}}}` : ''}}{${heading}}`)
    }
  }

  for (const section of content.custom) {
    body.push(`\\section{${tex(section.title)}}`, bullets(section.bullets))
  }

  return [PREAMBLE, '\\begin{document}', ...body.filter(Boolean), '\\end{document}', ''].join('\n')
}

export const moderncv: ResumeTemplate = {
  id: 'moderncv',
  name: 'moderncv',
  description: 'Dates in a left gutter, accent rules. Reads formal and European.',
  source: PREAMBLE,
  render,
}
