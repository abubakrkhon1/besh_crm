'use client'

import { Children, Fragment, type ReactNode, useMemo, useState } from 'react'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { TABLE_PAGE_SIZES } from './table-page-sizes'

type PaginatedTableProps = {
  header: ReactNode
  rows: ReactNode
  columnCount: number
  itemLabel: string
  emptyMessage: string
  initialPageSize?: number
  pageSizes?: readonly number[]
  cardClassName?: string
  embedded?: boolean
}

export function PaginatedTable({
  header,
  rows,
  columnCount,
  itemLabel,
  emptyMessage,
  initialPageSize = 10,
  pageSizes = TABLE_PAGE_SIZES,
  cardClassName = 'overflow-hidden py-0',
  embedded = false,
}: PaginatedTableProps) {
  const rowItems = Children.toArray(rows)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const pageCount = Math.max(1, Math.ceil(rowItems.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const firstVisibleRow = rowItems.length ? (currentPage - 1) * pageSize + 1 : 0
  const lastVisibleRow = Math.min(currentPage * pageSize, rowItems.length)
  const visibleRows = rowItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const visiblePages = useMemo(
    () => [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])].filter((value) => value >= 1 && value <= pageCount),
    [currentPage, pageCount],
  )

  const table = (
    <Table>
      {header}
      <TableBody>
        {visibleRows.length ? visibleRows : (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columnCount} className="h-32 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="min-w-0">
      {embedded ? <div className="border-t">{table}</div> : <Card className={cardClassName}>{table}</Card>}

      <div className={cn('flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between', embedded ? 'px-4' : 'px-1')}>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {firstVisibleRow === lastVisibleRow ? firstVisibleRow.toLocaleString() : `${firstVisibleRow.toLocaleString()}–${lastVisibleRow.toLocaleString()}`} of {rowItems.length.toLocaleString()} {itemLabel}
          </p>
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor={`${itemLabel.replaceAll(' ', '-')}-page-size`} className="whitespace-nowrap">Rows per page</FieldLabel>
            <NativeSelect
              id={`${itemLabel.replaceAll(' ', '-')}-page-size`}
              size="sm"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
            >
              {pageSizes.map((size) => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>

        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            {currentPage > 1 && <PaginationItem><PaginationPrevious href="#" onClick={(event) => { event.preventDefault(); setPage(currentPage - 1) }} /></PaginationItem>}
            {visiblePages.map((value, index) => (
              <Fragment key={value}>
                {index > 0 && visiblePages[index - 1] < value - 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
                <PaginationItem>
                  <PaginationLink href="#" isActive={value === currentPage} onClick={(event) => { event.preventDefault(); setPage(value) }}>{value}</PaginationLink>
                </PaginationItem>
              </Fragment>
            ))}
            {currentPage < pageCount && <PaginationItem><PaginationNext href="#" onClick={(event) => { event.preventDefault(); setPage(currentPage + 1) }} /></PaginationItem>}
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
