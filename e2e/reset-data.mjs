import fs from 'node:fs'
import path from 'node:path'

/**
 * Wipes a throwaway e2e data directory. Runs as part of the webServer command
 * rather than Playwright's globalSetup, because globalSetup fires *after* the
 * web server has already booted — by which point the app would have opened the
 * old database. The app migrates itself on boot, so wiping is all that's needed.
 *
 * Takes the directory as an argument because the gate suite runs two servers:
 * one ordinary app the phase gates share, and one genuinely cold machine for the
 * first-run golden path, which can neither inherit a database that has already
 * been set up nor leave its own behind for the others. See
 * `playwright.gates.config.ts`.
 */
const dir = path.resolve(process.cwd(), process.argv[2] ?? '.e2e-data')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
