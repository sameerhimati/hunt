import fs from 'node:fs'
import path from 'node:path'

/**
 * Wipes the throwaway e2e data directory. Runs as part of the webServer command
 * rather than Playwright's globalSetup, because globalSetup fires *after* the
 * web server has already booted — by which point the app would have opened the
 * old database. The app migrates itself on boot, so wiping is all that's needed.
 */
const dir = path.resolve(process.cwd(), '.e2e-data')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
