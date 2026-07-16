"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CreditCard, ReceiptText, Users } from "lucide-react"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type CustomerSection = "fuel-cards" | "drivers" | "transactions"

const activeTabClassName =
  "data-active:bg-primary data-active:text-amber-700 dark:data-active:text-amber-300 data-active:font-semibold data-active:shadow-sm"

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
    <Tabs value={value} onValueChange={navigate}>
      <TabsList>
        <TabsTrigger value="fuel-cards" className={activeTabClassName}>
          <CreditCard data-icon="inline-start" />
          Fuel Cards
        </TabsTrigger>
        <TabsTrigger value="drivers" className={activeTabClassName}>
          <Users data-icon="inline-start" />
          Drivers
        </TabsTrigger>
        <TabsTrigger value="transactions" className={activeTabClassName}>
          <ReceiptText data-icon="inline-start" />
          Transactions
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
