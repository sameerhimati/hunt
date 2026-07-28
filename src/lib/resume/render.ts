import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { renderTex, type TexInput } from './tex'
import { ensureTectonic } from './tectonic'

const run = promisify(execFile)

/**
 * LaTeX rendering, via Tectonic.
 *
 * Two properties matter more than speed:
 *
 *  - **Determinism.** `SOURCE_DATE_EPOCH` is pinned inside this function, so the
 *    same content renders to identical bytes on every run and every machine.
 *    Without it TeX stamps the current time into the PDF and every re-render
 *    looks like a change — which would make the version tree lie.
 *  - **No install step.** Tectonic is one static binary that fetches the TeX
 *    packages it needs on demand; `ensureTectonic()` downloads it on first use.
 *    Docker bakes it in. Either way the user installs no TeX distribution.
 */

/** Unix epoch zero. Any fixed value works; this one is obviously synthetic. */
const PINNED_EPOCH = '0'

const COMPILE_TIMEOUT_MS = 120_000

/**
 * Same input as `renderTex`: content plus an optional template, or a raw .tex
 * override that is compiled verbatim — the escape hatch that detaches a version
 * from the structured editor, and honouring it exactly is the whole point.
 */
export type RenderInput = TexInput

export interface RenderResult {
  pdf: Buffer
  tex: string
}

/** A LaTeX failure the user can act on: the compiler's own words, not a stack. */
export class LatexRenderError extends Error {
  readonly log: string

  constructor(log: string) {
    super(firstTexError(log) ?? 'Tectonic failed to compile this document.')
    this.name = 'LatexRenderError'
    this.log = log
  }
}

/** Pulls the first real TeX error line out of a very chatty log. */
function firstTexError(log: string): string | null {
  const line = log
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('error:') || entry.startsWith('!'))

  return line ? line.replace(/^error:\s*/, '') : null
}

export { renderTex }

export async function renderToPdf(input: RenderInput): Promise<RenderResult> {
  const tex = renderTex(input)
  const binary = await ensureTectonic()

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hunt-render-'))
  try {
    // A fixed filename, not a random one: Tectonic writes the job name into the
    // PDF, so a per-render name would defeat byte-stability.
    const source = path.join(dir, 'resume.tex')
    await fs.writeFile(source, tex, 'utf8')

    let log = ''
    try {
      const { stdout, stderr } = await run(binary, ['-X', 'compile', '--outdir', dir, source], {
        cwd: dir,
        timeout: COMPILE_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          SOURCE_DATE_EPOCH: PINNED_EPOCH,
          FORCE_SOURCE_DATE: '1',
          TZ: 'UTC',
        },
      })
      log = `${stdout}\n${stderr}`
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; message?: string }
      throw new LatexRenderError(
        `${failure.stdout ?? ''}\n${failure.stderr ?? failure.message ?? ''}`.trim(),
      )
    }

    const pdf = await fs.readFile(path.join(dir, 'resume.pdf')).catch(() => {
      throw new LatexRenderError(log)
    })

    return { pdf, tex }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}
