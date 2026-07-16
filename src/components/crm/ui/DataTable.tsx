'use client'

import React from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
} from '@tanstack/react-table'
import { Card } from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  onRowClick?: (row: TData) => void
  emptyTitle?: string
  emptyDescription?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  emptyTitle = 'No results',
  emptyDescription = 'Try adjusting your search or filters.',
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])

  // TanStack Table exposes mutable callbacks that React Compiler intentionally skips.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  })

  return (
    <div className="w-full">
      <Card className="overflow-hidden rounded-lg py-0">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/45">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="select-none whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  onClick={() => onRowClick?.(row.original)}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-36 text-center">
                  <div className="mx-auto max-w-sm space-y-1">
                    <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
                    <p className="text-sm text-muted-foreground">{emptyDescription}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <div className="flex flex-col gap-3 px-1 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground">{data.length} result{data.length === 1 ? '' : 's'}</p>
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor="data-table-page-size" className="whitespace-nowrap">Rows per page</FieldLabel>
            <NativeSelect id="data-table-page-size" size="sm" value={table.getState().pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))}>
              {[10, 25, 50, 100].map((size) => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
        </div>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            {table.getCanPreviousPage() && <PaginationItem><PaginationPrevious href="#" onClick={(event) => { event.preventDefault(); table.previousPage() }} /></PaginationItem>}
            {Array.from({ length: table.getPageCount() }, (_, index) => index).map((index) => <PaginationItem key={index}>
              <PaginationLink href="#" isActive={table.getState().pagination.pageIndex === index} onClick={(event) => { event.preventDefault(); table.setPageIndex(index) }}>{index + 1}</PaginationLink>
            </PaginationItem>)}
            {table.getCanNextPage() && <PaginationItem><PaginationNext href="#" onClick={(event) => { event.preventDefault(); table.nextPage() }} /></PaginationItem>}
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
