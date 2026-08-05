import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Standalone is what keeps the Docker image small, but it disables
  // `next start` — so it's opt-in via the Dockerfile rather than always on,
  // leaving local dev and the e2e suite on the normal server.
  ...(process.env.HUNT_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // better-sqlite3 is a native addon: bundling it produces a server that boots
  // and then segfaults on the first query. These have to be required at runtime.
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3', '@prisma/client'],
  // hunt reads its SQLite path from the filesystem at runtime, which Turbopack's
  // tracer can't follow. Pinning the root stops it from tracing the whole
  // project (and shipping it) as a precaution.
  outputFileTracingRoot: path.join(__dirname),
  headers: () =>
    Promise.resolve([
      { source: '/:path*', headers: SECURITY_HEADERS },
      // Order matters: this is applied after the blanket rule and overrides it
      // for one path.
      { source: '/api/resumes/preview/:id', headers: PREVIEW_HEADERS },
    ]),
}

/**
 * The privacy claim, enforced by the browser rather than promised in a README.
 *
 * hunt is a single-user app on localhost that talks to no third party *from the
 * page*: every outbound API call is made server-side with the user's own key.
 * So `connect-src 'self'` is not a precaution here, it is the product's headline
 * turned into something the browser refuses to violate — a stray analytics
 * snippet or a font from a CDN would fail rather than quietly phone home.
 *
 * Two allowances are load-bearing and should not be tightened without checking
 * the résumé editor:
 *
 *  - **`blob:` in `frame-src` and `img-src`.** The live PDF preview renders
 *    Tectonic's output through `URL.createObjectURL()` into an iframe. Drop
 *    `blob:` and the preview goes blank with a console error and nothing else.
 *  - **`'unsafe-inline'` in `style-src`.** React inlines styles, and Next's
 *    streaming HTML carries inline `<style>`. A nonce-based policy is the real
 *    fix and it needs middleware to mint one per request; that is a change worth
 *    making deliberately, not smuggling in beside a header.
 *
 * `'unsafe-eval'` is deliberately absent — nothing here evaluates strings, and
 * leaving it out means a future dependency that does gets caught rather than
 * silently permitted.
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "frame-src 'self' blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
  // A local app has no reason to announce where the user came from, and nothing
  // it links to needs to know.
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
]

/**
 * The one document hunt frames: the rendered résumé preview.
 *
 * `frame-ancestors 'none'` and `X-Frame-Options: DENY` are right for every page
 * here, and they are why the editor used to hand the `<iframe>` a `blob:` URL —
 * a blob carries no response headers, so nothing forbade framing it. Safari
 * will not display a PDF framed from a blob, so the bytes are served from a
 * real URL now, and a real URL gets the blanket headers, which then refuse to
 * be framed. Hence this override, scoped to exactly that path.
 *
 * It is narrower than the blanket policy, not wider: the PDF may be framed by
 * this origin and by nothing else, and `default-src 'none'` means the document
 * itself may not load or reach anything at all.
 */
const PREVIEW_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value: ["default-src 'none'", "frame-ancestors 'self'", "object-src 'none'"].join('; '),
  },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
]

export default nextConfig
