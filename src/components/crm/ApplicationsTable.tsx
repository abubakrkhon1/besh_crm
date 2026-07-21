'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Application } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { ApplicationDrawer } from './drawers/ApplicationDrawer'
import { NewApplicationModal } from './NewApplicationModal'
import { Calendar, Columns3, Download, ExternalLink, Plus, RefreshCw, Search } from 'lucide-react'
import { DataTable } from './ui/DataTable'
import { ColumnDef } from '@tanstack/react-table'
import { StatusBadge } from './ui/StatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ApplicationsTable({ initialApplications }: { initialApplications: Application[] }) {
  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    company_legal_name: true,
    contact: true,
    business_phone: true,
    created_at: true,
    status: true,
  })

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('applications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'applications' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newApplication = payload.new as Application
            setApplications((current) => [
              newApplication,
              ...current.filter((application) => application.id !== newApplication.id),
            ])
          }

          if (payload.eventType === 'UPDATE') {
            const updatedApplication = payload.new as Application
            setApplications((current) => {
              const exists = current.some((application) => application.id === updatedApplication.id)
              if (!exists) {
                return [updatedApplication, ...current]
              }

              return current.map((application) =>
                application.id === updatedApplication.id ? updatedApplication : application
              )
            })
            setSelectedApp((current) =>
              current?.id === updatedApplication.id ? updatedApplication : current
            )
          }

          if (payload.eventType === 'DELETE') {
            const deletedApplication = payload.old as Pick<Application, 'id'>
            setApplications((current) =>
              current.filter((application) => application.id !== deletedApplication.id)
            )
            setSelectedApp((current) =>
              current?.id === deletedApplication.id ? null : current
            )
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  const handleNewAppSuccess = (newApp: Application) => {
    setApplications(apps => [newApp, ...apps])
    setIsNewModalOpen(false)
  }

  const filteredApps = useMemo(() => applications.filter((app) => {
    const matchesSearch =
      app.company_legal_name.toLowerCase().includes(search.toLowerCase()) ||
      app.first_name.toLowerCase().includes(search.toLowerCase()) ||
      app.last_name.toLowerCase().includes(search.toLowerCase()) ||
      app.email.toLowerCase().includes(search.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter

    return matchesSearch && matchesStatus
  }), [applications, search, statusFilter])

  const allColumns: ColumnDef<Application>[] = [
    {
      accessorKey: 'company_legal_name',
      header: 'Company',
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{row.original.company_legal_name}</div>
          {row.original.doing_business_as && (
            <div className="text-xs text-muted-foreground">DBA: {row.original.doing_business_as}</div>
          )}
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => (
        <div>
          <div className="text-sm text-foreground">{row.original.first_name} {row.original.last_name}</div>
          <div className="text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      ),
    },
    {
      accessorKey: 'business_phone',
      header: 'Phone',
      cell: ({ row }) => <div className="text-sm text-foreground">{row.original.business_phone}</div>,
    },
    {
      accessorKey: 'created_at',
      header: 'Submitted',
      cell: ({ row }) => <div className="text-sm text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString()}</div>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status === 'pending' ? 'pending' : row.original.status === 'approved' ? 'success' : 'danger'}
          label={row.original.status.charAt(0).toUpperCase() + row.original.status.slice(1)}
        />
      ),
    },
  ]

  const columns = allColumns.filter((column) => visibleColumns[(column.id ?? (column as { accessorKey?: string }).accessorKey) as string] !== false)

  return (
    <div className="animate-fade-in pb-12">
      <Card className="mb-4 rounded-lg py-0">
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search applications..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border bg-card pl-9 pr-3 text-[13px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
              />
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger render={<button type="button" className={buttonVariants({ variant: 'outline', size: 'sm' })} />}>
                    Status
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Application status</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                      <DropdownMenuRadioItem value="all">All statuses</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="pending">Pending</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="approved">Approved</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="denied">Denied</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" disabled>
                  <Calendar className="size-4" />
                  Date
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<button type="button" className={buttonVariants({ variant: 'outline', size: 'sm' })} />}>
                    <Columns3 className="size-4" />
                    Columns
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {[
                      ['company_legal_name', 'Company'],
                      ['contact', 'Contact'],
                      ['business_phone', 'Phone'],
                      ['created_at', 'Submitted'],
                      ['status', 'Status'],
                    ].map(([key, label]) => (
                      <DropdownMenuCheckboxItem
                        key={key}
                        checked={visibleColumns[key] !== false}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((current) => ({ ...current, [key]: checked }))
                        }
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm">
                  <RefreshCw className="size-4" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="size-4" />
                  Export
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedApp && (
                  <Link href={`/crm/applications/${selectedApp.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <ExternalLink className="size-4" />
                    Open application
                  </Link>
                )}
                <Button size="sm" onClick={() => setIsNewModalOpen(true)}>
                  <Plus className="size-4" />
                  New application
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filteredApps}
        onRowClick={(row) => setSelectedApp(row)}
        emptyTitle="No applications found"
        emptyDescription="No applications match the current search and filters."
      />

      <ApplicationDrawer
        application={selectedApp}
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
      />

      {isNewModalOpen && (
        <NewApplicationModal
          onClose={() => setIsNewModalOpen(false)}
          onSuccess={handleNewAppSuccess}
        />
      )}
    </div>
  )
}
