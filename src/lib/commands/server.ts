'use server'

import { prisma } from '@/lib/db/client'

/**
 * Server actions for command palette (⌘K).
 * These are called by command `run` functions on the client.
 */

/**
 * Fetch the most recent application for "Start a tailor run" and "Run checks on this application".
 * Returns the application ID or null if none exist.
 */
export async function getMostRecentApplication(): Promise<string | null> {
  const application = await prisma.application.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return application?.id ?? null
}
