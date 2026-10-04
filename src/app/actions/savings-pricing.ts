'use server'

import { revalidatePath } from 'next/cache'
import { createClient, requireRoles } from '@/lib/supabase/server'
import { setStationSavingsPriceSchema } from '@/lib/validation/savings-pricing'
import type { StationSavingsPrice } from '@/types/database.types'

export type StationSavingsPriceWithEditor = StationSavingsPrice & { editor_name: string }

export type StationSavingsPriceListResult = {
  prices: StationSavingsPriceWithEditor[]
  error: string | null
}

export type SetStationSavingsPriceResult = {
  ok: boolean
  message: string
  prices?: StationSavingsPriceWithEditor[]
}

export async function listStationSavingsPrices(): Promise<StationSavingsPriceListResult> {
  const { profile, error } = await requireRoles(['owner', 'general_manager'])
  if (error || !profile) return { prices: [], error: 'You do not have permission to view savings pricing.' }

  const db = await createClient()
  const { data, error: queryError } = await db
    .from('station_savings_prices')
    .select('*, updated_by:profiles!station_savings_prices_updated_by_profile_id_fkey(full_name,email)')
    .order('effective_from', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(500)

  if (queryError) {
    console.error('listStationSavingsPrices:', queryError)
    return { prices: [], error: 'Savings prices could not be loaded.' }
  }

  const prices = (data ?? []).map((row: any) => {
    const editor = Array.isArray(row.updated_by) ? row.updated_by[0] : row.updated_by
    const price = { ...row }
    delete price.updated_by
    return {
      ...price,
      pump_price_per_gallon: price.pump_price_per_gallon == null ? null : Number(price.pump_price_per_gallon),
      wex_price_per_gallon: price.wex_price_per_gallon == null ? null : Number(price.wex_price_per_gallon),
      our_price_per_gallon: Number(price.our_price_per_gallon),
      customer_savings_per_gallon: price.customer_savings_per_gallon == null ? null : Number(price.customer_savings_per_gallon),
      gross_profit_per_gallon: price.gross_profit_per_gallon == null ? null : Number(price.gross_profit_per_gallon),
      editor_name: editor?.full_name ?? editor?.email ?? 'CRM user',
    } as StationSavingsPriceWithEditor
  })

  return { prices, error: null }
}

export async function setStationSavingsPrice(input: unknown): Promise<SetStationSavingsPriceResult> {
  const { profile, error } = await requireRoles(['owner', 'general_manager'])
  if (error || !profile) return { ok: false, message: 'You do not have permission to update savings pricing.' }

  const parsed = setStationSavingsPriceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter a valid station price.' }
  }

  const db = await createClient()
  const { error: saveError } = await db.rpc('set_station_margin_price', {
    p_station_brand: parsed.data.stationBrand,
    p_pump_price_per_gallon: parsed.data.pumpPrice,
    p_wex_price_per_gallon: parsed.data.wexPrice,
    p_customer_price_per_gallon: parsed.data.customerPrice,
    p_effective_from: parsed.data.effectiveDate,
    p_change_reason: parsed.data.note,
  })

  if (saveError) {
    console.error('setStationSavingsPrice:', saveError)
    return { ok: false, message: 'The station price could not be saved. Refresh the page and try again.' }
  }

  revalidatePath('/crm/savings-pricing')
  const refreshed = await listStationSavingsPrices()
  return refreshed.error
    ? { ok: true, message: 'Station price saved.' }
    : { ok: true, message: 'Station price saved.', prices: refreshed.prices }
}
