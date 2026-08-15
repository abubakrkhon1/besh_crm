"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { BarChart2, CreditCard, Download, Filter, ReceiptText, Search, Users } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"

export type CustomerSection = "fuel-cards" | "drivers" | "transactions" | "overview"

const activeTabClassName =
  "data-active:bg-primary-dim data-active:text-primary data-active:font-semibold data-active:shadow-sm"

export function CustomerSectionTabs({ value }: { value: CustomerSection }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()

  function navigate(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", nextValue)
    params.delete("cardsPage")
    params.delete("driversPage")
    params.delete("transactionsPage")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
      <Tabs value={value} onValueChange={navigate}>
        <TabsList className="h-8 bg-transparent p-0 gap-0">
          <TabsTrigger value="fuel-cards" className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
            <CreditCard className="mr-1.5 size-3.5" />
            Fuel Cards
          </TabsTrigger>
          <TabsTrigger value="drivers" className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
            <Users className="mr-1.5 size-3.5" />
            Drivers
          </TabsTrigger>
          <TabsTrigger value="transactions" className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
            <ReceiptText className="mr-1.5 size-3.5" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent px-3 py-1.5 text-xs font-medium data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
            <BarChart2 className="mr-1.5 size-3.5" />
            Overview
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Right-side controls */}
      <div className="flex items-center gap-2 shrink-0">
        <label className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-7 w-40 pl-8 text-xs"
            placeholder="Search cards…"
            aria-label="Search within section"
          />
        </label>
        <button
          type="button"
          aria-label="Filter"
          className="flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Filter className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Download"
          className="flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Download className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
