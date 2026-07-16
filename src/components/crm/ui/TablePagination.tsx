import { Fragment } from 'react'
import { RowsPerPageSelect } from './RowsPerPageSelect'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

type Props = {
  page: number
  pageSize: number
  total: number
  searchParams?: Record<string, string | number | undefined>
  pageParam?: string
  pageSizeParam?: string
  itemLabel?: string
}

export function TablePagination({ page, pageSize, total, searchParams = {}, pageParam = 'page', pageSizeParam = 'pageSize', itemLabel = 'results' }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount)
  const href = (target: number) => {
    const params = new URLSearchParams()
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value))
    })
    params.set(pageParam, String(target))
    return `?${params.toString()}`
  }
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter((value) => value >= 1 && value <= pageCount)
  return <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex flex-wrap items-center gap-4"><p className="text-sm text-muted-foreground">{total.toLocaleString()} {itemLabel}</p><RowsPerPageSelect value={pageSize} pageParam={pageParam} pageSizeParam={pageSizeParam} /></div>
    <Pagination className="mx-0 w-auto">
      <PaginationContent>
        {currentPage > 1 && <PaginationItem><PaginationPrevious href={href(currentPage - 1)} /></PaginationItem>}
        {visiblePages.map((value, index) => <Fragment key={value}>
          {index > 0 && visiblePages[index - 1] < value - 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
          <PaginationItem><PaginationLink href={href(value)} isActive={value === currentPage}>{value}</PaginationLink></PaginationItem>
        </Fragment>)}
        {currentPage < pageCount && <PaginationItem><PaginationNext href={href(currentPage + 1)} /></PaginationItem>}
      </PaginationContent>
    </Pagination>
  </div>
}
