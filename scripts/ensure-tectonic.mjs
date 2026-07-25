import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
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

/**
 * SHA-256 of each release tarball, taken from GitHub's own per-asset digests for
 * `tectonic@0.16.9`. We download something, mark it executable and then run it —
 * so the bytes get checked first. A mismatch means a re-uploaded asset, a
 * tampered mirror or a truncated transfer, and any of those should fail loudly
 * rather than silently install an unknown binary.
 *
 * Bumping TECTONIC_VERSION means refreshing these:
 *   gh api repos/tectonic-typesetting/tectonic/releases/tags/tectonic@<version> \
 *     --jq '.assets[] | "\(.name) \(.digest)"'
 */
const CHECKSUMS = {
  'aarch64-apple-darwin': 'edb67c61aba768289f6da441c9e6f523cfaff4f8b2a5708523ef29c543f8e88e',
  'x86_64-apple-darwin': '79d8839fa3594bfea9b2bf2ac0a0455bcc4d0de956a5e5c403107e9a72f79e86',
  'x86_64-unknown-linux-musl': '60b13a0826ae7ad9ce34b4a2df06bff2cfcfa6dda8a915477c0cbb84e1a4a902',
  'aarch64-unknown-linux-musl': 'f9aa39017dbd51f111fdb93dda222178cbe51c8193508fc567b523cc74fff9c1',
}

async function download(target, destination) {
  const url =
    `https://github.com/tectonic-typesetting/tectonic/releases/download/` +
    `tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${target}.tar.gz`

  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`ensure-tectonic: ${response.status} fetching ${url}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = crypto.createHash('sha256').update(bytes).digest('hex')
  const expected = CHECKSUMS[target]
  if (digest !== expected) {
    throw new Error(
      `ensure-tectonic: checksum mismatch for ${target}\n` +
        `  expected ${expected}\n  received ${digest}\n` +
        'Refusing to install. Delete the cache and retry; if it persists, the release has changed.',
    )
  }

  // Staged inside the cache directory, not os.tmpdir(), so the final rename is
  // guaranteed to be same-filesystem (a cross-device rename throws EXDEV).
  const cacheHome = path.dirname(destination)
  fs.mkdirSync(cacheHome, { recursive: true })
  const staging = fs.mkdtempSync(path.join(cacheHome, '.staging-'))

  try {
    const archive = path.join(staging, 'tectonic.tar.gz')
    fs.writeFileSync(archive, bytes)

    // The release tarball holds exactly one file: the binary.
    const untar = spawnSync('tar', ['-xzf', archive, '-C', staging, 'tectonic'], {
      stdio: 'inherit',
    })
    if (untar.status !== 0) throw new Error('ensure-tectonic: tar failed')

    const extracted = path.join(staging, 'tectonic')
    fs.chmodSync(extracted, 0o755)

    // Renamed into place last, and only once complete: `ensureTectonic()` treats
    // the mere existence of this path as "ready to execute", so a concurrent
    // caller must never be able to observe a half-extracted file there.
    fs.renameSync(extracted, destination)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
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
