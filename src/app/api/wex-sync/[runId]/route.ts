import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncRunSchema } from '@/lib/integrations/wex/schemas'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const parsed = syncRunSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Invalid synchronization run.' }, { status: 400 })

  const auth = await requireAdmin()
  if (!auth.user) return NextResponse.json({ ok: false, message: 'Not authorized.' }, { status: 403 })

  let db: ReturnType<typeof createAdminClient>
  try {
    db = createAdminClient()
  } catch {
    return NextResponse.json({ ok: false, message: 'Server database configuration is incomplete.' }, { status: 500 })
  }

  const { data, error } = await db
    .from('fuel_card_sync_runs')
    .select('status,metadata,error_message,cards_received,cards_unmatched')
    .eq('id', parsed.data.runId)
    .eq('created_by', auth.user.id)
    .single()

  if (error || !data) return NextResponse.json({ ok: false, message: 'Synchronization progress is unavailable.' }, { status: 404 })

  return NextResponse.json(
    {
      ok: true,
      status: data.status,
      metadata: data.metadata ?? {},
      errorMessage: data.error_message,
      cardsReceived: data.cards_received,
      cardsUnmatched: data.cards_unmatched,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
