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
}

export default nextConfig
