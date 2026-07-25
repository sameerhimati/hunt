import { dateRange, joinDefined, tex } from '../latex'
import type { ResumeContent } from '../schema'
import type { ResumeTemplate } from './types'

/**
 * Jake's résumé — the single-column ATS-safe layout that most engineering
 * résumés on the internet descend from. Rebuilt here on stock packages
 * (`geometry`, `titlesec`, `enumitem`) rather than a downloaded .cls so the
 * render has no dependency Tectonic has to hunt for.
 */

const PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage[margin=0.55in]{geometry}
\usepackage{titlesec}
\usepackage{enumitem}
\usepackage{tabularx}
\usepackage[hidelinks]{hyperref}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\tabcolsep}{0pt}
\titleformat{\section}{\large\scshape\raggedright}{}{0em}{}[\vspace{-0.6em}\rule{\linewidth}{0.6pt}\vspace{-0.3em}]
\titlespacing{\section}{0pt}{9pt}{4pt}
\newcolumntype{R}{>{\raggedleft\arraybackslash}X}
\newcommand{\entry}[4]{%
  \begin{tabularx}{\linewidth}{@{}lR@{}}
    \textbf{#1} & \textbf{#2} \\
    \textit{\small #3} & \textit{\small #4} \\
  \end{tabularx}\vspace{-2pt}}
`

function bullets(items: string[]): string {
  if (items.length === 0) return ''
  return [
    '\\begin{itemize}[leftmargin=1.4em,itemsep=1pt,parsep=0pt,topsep=3pt]',
    ...items.map((item) => `  \\item ${tex(item)}`),
    '\\end{itemize}',
  ].join('\n')
}

function render(content: ResumeContent): string {
  const { basics } = content
  const contact = joinDefined(
    [basics.email, basics.phone, basics.location, basics.url].map((part) => tex(part)),
    ' $\\cdot$ ',
  )

  // Joined rather than emitted line by line: a trailing `\\` with nothing after
  // it is a LaTeX error, and a blank résumé (no label, no contact yet) is the
  // first thing the editor renders.
  const header = [
    `{\\Huge\\scshape ${tex(basics.name)}}`,
    basics.label ? `{\\large ${tex(basics.label)}}` : '',
    contact ? `\\small ${contact}` : '',
  ].filter(Boolean)

  const body: string[] = ['\\begin{center}', header.join(' \\\\ \\vspace{4pt}\n'), '\\end{center}']

  if (basics.summary) {
    body.push('\\section{Summary}', tex(basics.summary))
  }

  if (content.experience.length > 0) {
    body.push('\\section{Experience}')
    for (const job of content.experience) {
      body.push(
        `\\entry{${tex(job.company)}}{${dateRange(job.start, job.end)}}{${tex(job.title)}}{${tex(job.location)}}`,
        bullets(job.bullets),
      )
    }
  }

  if (content.projects.length > 0) {
    body.push('\\section{Projects}')
    for (const project of content.projects) {
      body.push(
        `\\textbf{${tex(project.name)}}${project.description ? ` --- ${tex(project.description)}` : ''}`,
        project.url ? `\\\\ {\\small\\texttt{${tex(project.url)}}}` : '',
        bullets(project.bullets),
      )
    }
  }

  if (content.education.length > 0) {
    body.push('\\section{Education}')
    for (const school of content.education) {
      body.push(
        `\\entry{${tex(school.institution)}}{${dateRange(school.start, school.end)}}{${tex(school.degree)}}{${tex(school.location)}}`,
        bullets(school.bullets),
      )
    }
  }

  if (content.skills.length > 0) {
    body.push('\\section{Skills}')
    body.push('\\begin{itemize}[leftmargin=1.4em,itemsep=1pt,parsep=0pt,topsep=3pt,label={}]')
    for (const group of content.skills) {
      body.push(`  \\item \\textbf{${tex(group.category)}:} ${group.items.map((item) => tex(item)).join(', ')}`)
    }
    body.push('\\end{itemize}')
  }

  for (const section of content.custom) {
    body.push(`\\section{${tex(section.title)}}`, bullets(section.bullets))
  }

  return [PREAMBLE, '\\begin{document}', ...body.filter(Boolean), '\\end{document}', ''].join('\n')
}

export const jakes: ResumeTemplate = {
  id: 'jakes',
  name: "Jake's",
  description: 'Single column, ATS-safe. The default most engineering résumés use.',
  source: PREAMBLE,
  render,
}
