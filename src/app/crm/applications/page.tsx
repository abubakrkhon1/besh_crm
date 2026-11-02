import { getApplicationPage, getApplicationSummary } from '@/app/actions/applications'
import { ApplicationsTable } from '@/components/crm/ApplicationsTable'
import type { ApplicationStatus } from '@/types/database.types'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = enumParam(params.status, ['pending', 'under_review', 'needs_documents', 'approved', 'denied'] as const)
  const dateFilter = enumParam(params.date, ['all', 'this_month', 'last_30_days'] as const) ?? 'all'
  const query = stringParam(params.q)?.slice(0, 100) ?? ''
  const page = positiveInteger(params.page, 1)
  const pageSize = [10, 25, 50, 100].includes(positiveInteger(params.pageSize, 25)) ? positiveInteger(params.pageSize, 25) : 25
  const [applicationPage, summary] = await Promise.all([
    getApplicationPage({ page, pageSize, search: query, status: status as ApplicationStatus | undefined, dateFilter }),
    getApplicationSummary(),
  ])

  return <ApplicationsTable
    applications={applicationPage.applications}
    total={applicationPage.total}
    page={applicationPage.page}
    pageSize={applicationPage.pageSize}
    summary={summary}
    initialSearch={query}
    initialStatus={status ?? 'all'}
    initialDateFilter={dateFilter}
  />
}

function stringParam(value: string | string[] | undefined) { return typeof value === 'string' ? value : undefined }
function positiveInteger(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(stringParam(value)); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
function enumParam<const T extends readonly string[]>(value: string | string[] | undefined, values: T): T[number] | undefined {
  const parsed = stringParam(value); return parsed && values.includes(parsed) ? parsed as T[number] : undefined
}
