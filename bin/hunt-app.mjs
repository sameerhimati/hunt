#!/usr/bin/env node
/**
 * `npx hunt-app` — the no-clone path.
 *
 * The promise in PLAN.md is that a stranger on a fresh machine reaches a
 * working app in under fifteen minutes, and the Docker path already does that.
 * This is for the person who has Node and would rather not install Docker to
 * run a single-user SQLite app.
 *
 * It deliberately does almost nothing: check the runtime, pick a port, point
 * the data directory somewhere durable, and hand off to `next start`. Every
 * piece of real setup happens inside the app — the database migrates itself on
 * first query, and Tectonic downloads itself the first time a PDF is rendered —
 * because a launcher that does setup is a second place for setup to be wrong.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Node 22, and the reason is specific rather than conservative:
 * `better-sqlite3` publishes prebuilt binaries for it. On an older runtime npm
 * falls back to compiling from source, which needs a toolchain the user did not
 * agree to install and fails with a wall of C++ instead of a sentence.
 */
const major = Number(process.versions.node.split('.')[0])
if (major < 22) {
  console.error(
    `hunt needs Node 22 or newer; this is ${process.versions.node}.\n` +
      'Node 22 is what better-sqlite3 ships prebuilt binaries for — on older\n' +
      'versions it tries to compile from source instead. https://nodejs.org',
  )
  process.exit(1)
}

const port = process.env.PORT ?? process.env.HUNT_PORT ?? '3000'

/**
 * Where the user's job hunt lives. Defaults next to the install rather than to
 * the working directory: `npx` is run from wherever the user happens to be
 * standing, and a database that appears in one folder and vanishes when they
 * `cd` is the kind of data loss that reads as a bug in the app.
 */
const dataDir = process.env.HUNT_DATA_DIR ?? path.join(root, 'data')
fs.mkdirSync(dataDir, { recursive: true })

if (!fs.existsSync(path.join(root, '.next'))) {
  console.error(
    'This copy of hunt has no build in it (no .next directory).\n' +
      'From a git clone, run `pnpm install && pnpm build` first.',
  )
  process.exit(1)
}

console.log(`hunt → http://localhost:${port}`)
console.log(`data → ${dataDir}`)
console.log('nothing leaves this machine except the API calls you configure.\n')

const child = spawn(
  process.execPath,
  [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--port', port],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, HUNT_DATA_DIR: dataDir, PORT: port },
  },
)

// Forwarded rather than left to die with the parent: without this, Ctrl-C
// leaves a next server holding the port and the user's next launch fails with
// EADDRINUSE on a machine they think is idle.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code) => process.exit(code ?? 0))
