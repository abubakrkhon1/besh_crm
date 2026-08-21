import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processNextWexJob } from '@/lib/integrations/wex/jobs'
import { validateWexEnvironment } from '@/lib/integrations/wex/schemas'

export const runtime = 'nodejs'
export const maxDuration = 240
export const dynamic = 'force-dynamic'

function authorized(request: Request) {
  const expected = process.env.WEX_WORKER_SECRET
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !received) return false
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 })
  const environment = validateWexEnvironment()
  if (!environment.ok) {
    console.error('[WEX worker] Configuration is incomplete.', { invalidVariables: environment.missing })
    return NextResponse.json({ ok: false, message: 'WEX worker configuration is incomplete.' }, { status: 503 })
  }
  try {
    const result = await processNextWexJob()
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[WEX worker] Invocation failed before job processing.', { message: error instanceof Error ? error.message : 'Unknown worker error' })
    return NextResponse.json({ ok: false, message: 'WEX worker invocation failed.' }, { status: 500 })
  }
}
