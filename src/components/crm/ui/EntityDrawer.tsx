'use client'

import { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'

interface EntityDrawerProps {
  isOpen: boolean
  onClose: () => void
  headerContent?: ReactNode
  footerContent?: ReactNode
  children: ReactNode
}

export function EntityDrawer({ isOpen, onClose, headerContent, footerContent, children }: EntityDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <SheetContent 
        side="right" 
        className="w-full gap-0 p-0 sm:max-w-[520px] lg:max-w-[640px]"
      >
        {headerContent && (
          <SheetHeader className="shrink-0 border-b pr-12">
            {headerContent}
          </SheetHeader>
        )}
        
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-4">
            {children}
          </div>
        </ScrollArea>

        {footerContent && (
          <SheetFooter className="shrink-0 flex-wrap border-t bg-background sm:flex-row sm:items-center sm:justify-end">
            {footerContent}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
