'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { TABLE_PAGE_SIZES } from './table-page-sizes'

export function RowsPerPageSelect({ value, pageParam = 'page', pageSizeParam = 'pageSize' }: { value: number, pageParam?: string, pageSizeParam?: string }) {
  const router = useRouter(), pathname = usePathname(), searchParams = useSearchParams()
  return <Field orientation="horizontal" className="w-auto">
    <FieldLabel htmlFor={`${pageSizeParam}-rows`} className="whitespace-nowrap">Rows per page</FieldLabel>
    <NativeSelect id={`${pageSizeParam}-rows`} size="sm" value={value} onChange={(event) => {
      const next = new URLSearchParams(searchParams)
      next.set(pageSizeParam, event.target.value)
      next.set(pageParam, '1')
      router.replace(`${pathname}?${next.toString()}`)
    }}>
      {TABLE_PAGE_SIZES.map((size) => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}
    </NativeSelect>
  </Field>
}
