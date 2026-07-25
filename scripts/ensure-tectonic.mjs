import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Resolves a Tectonic binary, downloading one on first use.
 *
 * hunt renders résumés with LaTeX, and the promise is that nothing has to be
 * installed first. Docker bakes Tectonic into the image; on bare metal we fetch
 * the same static release into a user-level cache. Tectonic is a single
 * self-contained binary that pulls the TeX packages it needs on demand, which
 * is why it is the only TeX distribution that can honour that promise.
 *
 *   node scripts/ensure-tectonic.mjs      prints the resolved path
 *
 * Overrides: `HUNT_TECTONIC_BIN` points at a binary directly (Docker sets it to
 * /usr/local/bin/tectonic implicitly by having it on PATH).
 */

export const TECTONIC_VERSION = '0.16.9'

const TARGETS = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-musl',
  'linux-arm64': 'aarch64-unknown-linux-musl',
}

function cacheDir() {
  const base =
    process.env.HUNT_CACHE_DIR ??
    path.join(os.homedir(), process.platform === 'darwin' ? 'Library/Caches' : '.cache', 'hunt')
  return path.join(base, `tectonic-${TECTONIC_VERSION}`)
}

function onPath() {
  const probe = spawnSync('tectonic', ['--version'], { stdio: 'ignore' })
  return probe.status === 0 ? 'tectonic' : null
}

async function download(target, destination) {
  const url =
    `https://github.com/tectonic-typesetting/tectonic/releases/download/` +
    `tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${target}.tar.gz`

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`ensure-tectonic: ${response.status} fetching ${url}`)
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true })
  const archive = `${destination}.tar.gz`
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()))

  // The release tarball holds exactly one file: the binary.
  const untar = spawnSync('tar', ['-xzf', archive, '-C', path.dirname(destination), 'tectonic'], {
    stdio: 'inherit',
  })
  fs.rmSync(archive, { force: true })
  if (untar.status !== 0) throw new Error('ensure-tectonic: tar failed')

  fs.chmodSync(destination, 0o755)
}

let pending = null

/**
 * Path to a usable `tectonic`. Concurrent callers share one download — the
 * render gate compiles three templates and would otherwise race on the file.
 */
export function ensureTectonic() {
  if (process.env.HUNT_TECTONIC_BIN) return Promise.resolve(process.env.HUNT_TECTONIC_BIN)

  const cached = path.join(cacheDir(), 'tectonic')
  if (fs.existsSync(cached)) return Promise.resolve(cached)

  const system = onPath()
  if (system) return Promise.resolve(system)

  const target = TARGETS[`${process.platform}-${process.arch}`]
  if (!target) {
    throw new Error(
      `ensure-tectonic: no Tectonic release for ${process.platform}-${process.arch}. ` +
        'Install Tectonic yourself and set HUNT_TECTONIC_BIN.',
    )
  }

  pending ??= download(target, cached)
    .then(() => cached)
    .catch((error) => {
      pending = null
      throw error
    })

  return pending
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureTectonic().then(
    (binary) => console.log(binary),
    (error) => {
      console.error(error.message)
      process.exit(1)
    },
  )
}
