'use client'

import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  emptyCustomSection,
  emptyEducation,
  emptyExperience,
  emptyProject,
  emptySkillGroup,
  type ResumeContent,
} from '@/lib/resume/schema'
import { cn } from '@/lib/utils'

/**
 * The structured half of the Overleaf split: the résumé as fields, not as
 * LaTeX. Every input maps to one addressable path (`experience[0].bullets[3]`)
 * — the same paths tailoring cites, which is what lets a citation chip scroll
 * to the exact field it refers to.
 */

interface StructuredEditorProps {
  content: ResumeContent
  onChange: (next: ResumeContent) => void
  /** Import review flags fields the PDF didn't literally contain. */
  lowConfidencePaths?: Set<string>
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </header>
      {children}
    </section>
  )
}

function Field({
  label,
  path,
  value,
  onChange,
  flagged,
  placeholder,
}: {
  label: string
  path: string
  value: string
  onChange: (value: string) => void
  flagged?: boolean
  placeholder?: string
}) {
  const id = `field-${path.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`

  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        data-testid={id}
        data-path={path}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-8', flagged && 'border-warn')}
      />
    </div>
  )
}

function Bullets({
  path,
  bullets,
  onChange,
}: {
  path: string
  bullets: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {bullets.map((bullet, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <span aria-hidden="true" className="mt-2 select-none text-faint">
            •
          </span>
          <Textarea
            data-testid={`field-${path}-bullet-${index}`}
            value={bullet}
            rows={2}
            onChange={(event) => {
              const next = [...bullets]
              next[index] = event.target.value
              onChange(next)
            }}
            className="min-h-0 resize-y py-1.5 text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove bullet"
            onClick={() => onChange(bullets.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground"
        onClick={() => onChange([...bullets, ''])}
      >
        <Plus size={14} aria-hidden="true" />
        add bullet
      </Button>
    </div>
  )
}

export function StructuredEditor({
  content,
  onChange,
  lowConfidencePaths,
}: StructuredEditorProps) {
  const flagged = (path: string) => lowConfidencePaths?.has(path) ?? false

  /** Every edit clones first: the draft is compared against saved versions. */
  const edit = (mutate: (draft: ResumeContent) => void) => {
    const next = structuredClone(content)
    mutate(next)
    onChange(next)
  }

  return (
    <div data-testid="structured-editor" className="space-y-3 p-4">
      <Section title="Profile">
        <div className="space-y-2">
          {(
            [
              ['Name', 'name', 'Alex Chen'],
              ['Headline', 'label', 'Backend Engineer'],
              ['Email', 'email', 'you@example.com'],
              ['Phone', 'phone', ''],
              ['Location', 'location', 'San Francisco, CA'],
              ['Link', 'url', 'github.com/you'],
            ] as const
          ).map(([label, key, placeholder]) => (
            <Field
              key={key}
              label={label}
              path={`basics.${key}`}
              placeholder={placeholder}
              flagged={flagged(`basics.${key}`)}
              value={content.basics[key] ?? ''}
              onChange={(value) =>
                edit((draft) => {
                  draft.basics[key] = value
                })
              }
            />
          ))}

          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <Label htmlFor="field-basics-summary" className="pt-2 text-xs text-muted-foreground">
              Summary
            </Label>
            <Textarea
              id="field-basics-summary"
              data-testid="field-basics-summary"
              rows={3}
              value={content.basics.summary ?? ''}
              onChange={(event) =>
                edit((draft) => {
                  draft.basics.summary = event.target.value
                })
              }
            />
          </div>
        </div>
      </Section>

      <Section
        title="Experience"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((draft) => {
                draft.experience.push(emptyExperience())
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            add role
          </Button>
        }
      >
        <div className="space-y-4">
          {content.experience.map((job, index) => (
            <div key={index} className="rounded-md border border-border/70 bg-surface-2/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs text-faint">experience[{index}]</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove role"
                  onClick={() =>
                    edit((draft) => {
                      draft.experience.splice(index, 1)
                    })
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </div>

              <div className="space-y-2">
                {(
                  [
                    ['Company', 'company'],
                    ['Title', 'title'],
                    ['Location', 'location'],
                    ['Start', 'start'],
                    ['End', 'end'],
                  ] as const
                ).map(([label, key]) => (
                  <Field
                    key={key}
                    label={label}
                    path={`experience[${index}].${key}`}
                    flagged={flagged(`experience[${index}].${key}`)}
                    placeholder={key === 'end' ? 'blank for Present' : undefined}
                    value={job[key] ?? ''}
                    onChange={(value) =>
                      edit((draft) => {
                        draft.experience[index][key] = value
                      })
                    }
                  />
                ))}
              </div>

              <Bullets
                path={`experience-${index}`}
                bullets={job.bullets}
                onChange={(bullets) =>
                  edit((draft) => {
                    draft.experience[index].bullets = bullets
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Education"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((draft) => {
                draft.education.push(emptyEducation())
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            add school
          </Button>
        }
      >
        <div className="space-y-4">
          {content.education.map((school, index) => (
            <div key={index} className="space-y-2 rounded-md border border-border/70 bg-surface-2/40 p-3">
              {(
                [
                  ['School', 'institution'],
                  ['Degree', 'degree'],
                  ['Start', 'start'],
                  ['End', 'end'],
                ] as const
              ).map(([label, key]) => (
                <Field
                  key={key}
                  label={label}
                  path={`education[${index}].${key}`}
                  flagged={flagged(`education[${index}].${key}`)}
                  value={school[key] ?? ''}
                  onChange={(value) =>
                    edit((draft) => {
                      draft.education[index][key] = value
                    })
                  }
                />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Skills"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((draft) => {
                draft.skills.push(emptySkillGroup())
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            add group
          </Button>
        }
      >
        <div className="space-y-2">
          {content.skills.map((group, index) => (
            <div key={index} className="space-y-2 rounded-md border border-border/70 bg-surface-2/40 p-3">
              <Field
                label="Category"
                path={`skills[${index}].category`}
                value={group.category}
                onChange={(value) =>
                  edit((draft) => {
                    draft.skills[index].category = value
                  })
                }
              />
              <Field
                label="Items"
                path={`skills[${index}].items`}
                placeholder="Go, TypeScript, Postgres"
                value={group.items.join(', ')}
                onChange={(value) =>
                  edit((draft) => {
                    draft.skills[index].items = value
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Projects"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((draft) => {
                draft.projects.push(emptyProject())
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            add project
          </Button>
        }
      >
        <div className="space-y-4">
          {content.projects.map((project, index) => (
            <div key={index} className="rounded-md border border-border/70 bg-surface-2/40 p-3">
              <div className="space-y-2">
                {(
                  [
                    ['Name', 'name'],
                    ['Description', 'description'],
                    ['Link', 'url'],
                  ] as const
                ).map(([label, key]) => (
                  <Field
                    key={key}
                    label={label}
                    path={`projects[${index}].${key}`}
                    value={project[key] ?? ''}
                    onChange={(value) =>
                      edit((draft) => {
                        draft.projects[index][key] = value
                      })
                    }
                  />
                ))}
              </div>

              <Bullets
                path={`projects-${index}`}
                bullets={project.bullets}
                onChange={(bullets) =>
                  edit((draft) => {
                    draft.projects[index].bullets = bullets
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Custom sections"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              edit((draft) => {
                draft.custom.push(emptyCustomSection())
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            add section
          </Button>
        }
      >
        <div className="space-y-4">
          {content.custom.length === 0 ? (
            <p className="text-xs text-faint">
              Awards, talks, publications — anything the six sections above don&rsquo;t cover.
            </p>
          ) : null}

          {content.custom.map((section, index) => (
            <div key={index} className="rounded-md border border-border/70 bg-surface-2/40 p-3">
              <Field
                label="Title"
                path={`custom[${index}].title`}
                value={section.title}
                onChange={(value) =>
                  edit((draft) => {
                    draft.custom[index].title = value
                  })
                }
              />
              <Bullets
                path={`custom-${index}`}
                bullets={section.bullets}
                onChange={(bullets) =>
                  edit((draft) => {
                    draft.custom[index].bullets = bullets
                  })
                }
              />
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
