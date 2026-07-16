'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { EntityDrawer } from '@/components/crm/ui/EntityDrawer'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { ActivityTimeline } from '@/components/crm/ui/ActivityTimeline'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { format } from 'date-fns'

interface Application {
  id: string
  company_legal_name: string
  status: string
  created_at: string
  [key: string]: any
}

interface ApplicationDrawerProps {
  application: Application | null
  isOpen: boolean
  onClose: () => void
}

const tabs = ['Overview', 'Company', 'Documents', 'Notes', 'Timeline']

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value || 'Not provided'}</p>
    </div>
  )
}

export function ApplicationDrawer({ application, isOpen, onClose }: ApplicationDrawerProps) {
  const [visibleApplication, setVisibleApplication] = useState<Application | null>(application)

  useEffect(() => {
    if (application) {
      // Preserve drawer content while its close animation finishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleApplication(application)
    }
  }, [application])

  const activeApplication = application ?? visibleApplication

  if (!activeApplication) return null

  return (
    <Tabs defaultValue="Overview" className="w-full">
      <EntityDrawer 
        isOpen={isOpen} 
        onClose={onClose} 
        headerContent={
          <div className="flex w-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="truncate text-lg font-semibold">{activeApplication.company_legal_name}</SheetTitle>
                <SheetDescription>
                  {activeApplication.first_name} {activeApplication.last_name} · {activeApplication.email}
                </SheetDescription>
              </div>
              <StatusBadge
                status={activeApplication.status === 'pending' ? 'pending' : activeApplication.status === 'approved' ? 'success' : 'danger'}
                label={activeApplication.status.charAt(0).toUpperCase() + activeApplication.status.slice(1)}
              />
            </div>
            
            <TabsList variant="line" className="mt-5 h-9 w-full justify-start gap-4 overflow-x-auto">
              {tabs.map((tab) => (
                <TabsTrigger 
                  key={tab} 
                  value={tab}
                  className="flex-none px-3 text-sm focus-visible:border-transparent focus-visible:ring-0"
                >
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        }
        footerContent={
          <>
            <Link href={`/crm/applications/${activeApplication.id}`} className={buttonVariants({ variant: 'outline', className: 'shrink-0' })}>
              Open full page
            </Link>
            <Button variant="outline" className="shrink-0">Request Documents</Button>
            <AlertDialog>
              <AlertDialogTrigger render={<button type="button" className={buttonVariants({ variant: 'destructive' })} />}>Reject</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the application as denied. You can still review it later from the application record.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Reject</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger render={<button type="button" className={buttonVariants()} />}>Approve</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move the fleet into the customer onboarding queue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction>Approve</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      >
        <TabsContent value="Overview" className="mt-0 space-y-4 border-0 outline-none">
          <div className="grid grid-cols-2 gap-3">
            <Card className="rounded-lg py-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Requested Cards</p>
                <p className="mt-1 text-xl font-semibold">{activeApplication.total_drivers || activeApplication.total_trucks}</p>
              </CardContent>
            </Card>
            <Card className="rounded-lg py-0">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Requested Credit</p>
                <p className="mt-1 text-xl font-semibold">${Number(activeApplication.projected_spend || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Application Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Applicant" value={`${activeApplication.first_name} ${activeApplication.last_name}`} />
              <Field label="Title" value={activeApplication.title} />
              <Field label="Email" value={activeApplication.email} />
              <Field label="Phone" value={activeApplication.business_phone} />
              <Field label="Status" value={activeApplication.status} />
              <Field label="Submitted" value={format(new Date(activeApplication.created_at), 'MMM d, yyyy')} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Company" className="mt-0 border-0 outline-none">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Legal name" value={activeApplication.company_legal_name} />
              <Field label="DBA" value={activeApplication.doing_business_as} />
              <Field label="Industry" value={activeApplication.industry} />
              <Field label="Structure" value={activeApplication.legal_structure} />
              <Field label="Trucks" value={activeApplication.total_trucks} />
              <Field label="Drivers" value={activeApplication.total_drivers} />
              <div className="col-span-2">
                <Separator className="mb-4" />
                <Field label="Address" value={`${activeApplication.business_physical_address}, ${activeApplication.city}, ${activeApplication.state_province} ${activeApplication.postal_code}`} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Documents" className="mt-0 border-0 outline-none">
          <Card className="rounded-lg">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No supporting documents have been attached yet.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Notes" className="mt-0 border-0 outline-none">
          <Card className="rounded-lg">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No internal notes for this application.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Timeline" className="mt-0 border-0 outline-none">
          <ActivityTimeline
            events={[
              { id: '1', title: 'Application Submitted', date: new Date(activeApplication.created_at).toLocaleDateString() },
              { id: '2', title: 'Under Review', date: 'Pending', description: 'Assigned to underwriting team.' }
            ]}
          />
        </TabsContent>
      </EntityDrawer>
    </Tabs>
  )
}
