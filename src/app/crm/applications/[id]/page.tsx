import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, CreditCard, FileCheck, Truck, UserRound } from 'lucide-react'
import { getApplication } from '@/app/actions/applications'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { ActivityTimeline } from '@/components/crm/ui/ActivityTimeline'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Application } from '@/types/database.types'
import { format } from 'date-fns'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const application = await getApplication(id)

  if (!application) notFound()

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-6">
        <Link href="/crm/applications" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mb-4 -ml-2' })}>
          <ArrowLeft className="size-4" />
          Applications
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{application.company_legal_name}</h1>
              <ApplicationStatus status={application.status} />
              <Badge variant="outline">{application.industry}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {application.first_name} {application.last_name} · {application.email} · {application.business_phone}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">Request Documents</Button>
            <AlertDialog>
              <AlertDialogTrigger render={<button type="button" className={buttonVariants({ variant: 'ghost', className: 'text-destructive hover:bg-destructive/10 hover:text-destructive' })} />}>Reject</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the application as denied. You can still review it later from the application record.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reject</AlertDialogAction>
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
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Projected Spend" value={money(application.projected_spend)} icon={<CreditCard className="size-5" />} />
        <Metric title="Total Trucks" value={String(application.total_trucks)} icon={<Truck className="size-5" />} />
        <Metric title="Total Drivers" value={String(application.total_drivers)} icon={<UserRound className="size-5" />} />
        <Metric title="Submitted" value={date(application.submitted_at ?? application.created_at)} icon={<FileCheck className="size-5" />} />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList variant="line" className="mb-6 h-9 w-full justify-start gap-5 overflow-x-auto">
          {['overview', 'company', 'fleet', 'credit', 'applicant', 'review'].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="px-3 capitalize focus-visible:ring-0">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0 grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Application Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Info label="Legal name" value={application.company_legal_name} />
              <Info label="Doing business as" value={application.doing_business_as} />
              <Info label="Account type" value={application.account_type} />
              <Info label="Payment method" value={application.payment_method} />
              <Info label="Legal structure" value={application.legal_structure} />
              <Info label="Year established" value={String(application.year_established)} />
              <div className="sm:col-span-2">
                <Info label="Business description" value={application.business_description} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline
                events={[
                  { id: 'created', title: 'Application created', date: date(application.created_at), icon: <Building2 className="size-4" /> },
                  { id: 'submitted', title: 'Submitted for review', date: date(application.submitted_at ?? application.created_at), description: 'Application entered underwriting queue.' },
                  ...(application.reviewed_at ? [{ id: 'reviewed', title: 'Review completed', date: date(application.reviewed_at), description: `Decision: ${application.status}` }] : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company" className="mt-0">
          <Section title="Company & Business" columns={[
            ['Business phone', application.business_phone],
            ['Country', application.country],
            ['Address', address(application)],
            ['Parent company', application.parent_company],
            ['Promotional code', application.promotional_code],
            ['Taxpayer ID', mask(application.taxpayer_id)],
            ['Business ID type', application.business_identifier_type],
            ['Business ID number', application.business_identifier_number],
            ['Annual revenue', application.annual_gross_revenue ? money(application.annual_gross_revenue) : null],
          ]} />
        </TabsContent>

        <TabsContent value="fleet" className="mt-0">
          <Section title="Fleet Profile" columns={[
            ['Total trucks', String(application.total_trucks)],
            ['Total drivers', String(application.total_drivers)],
            ['Team drivers / slip seat', application.team_drivers_slip_seat ? 'Yes' : 'No'],
            ['Industry', application.industry],
            ['Requested cards', String(application.total_drivers || application.total_trucks)],
            ['Projected spend', money(application.projected_spend)],
          ]} />
        </TabsContent>

        <TabsContent value="credit" className="mt-0 grid gap-6 xl:grid-cols-2">
          <Section title="Payment & Bank" columns={[
            ['Payment method', application.payment_method],
            ['Days of payment', application.days_of_payment],
            ['Financial institution', application.financial_institution],
            ['Checking account', mask(application.checking_account_number)],
            ['ABA routing', mask(application.aba_routing_number)],
          ]} />
          <Section title="Credit Request" columns={[
            ['Projected monthly spend', money(application.projected_spend)],
            ['Account type', application.account_type],
            ['Terms accepted', application.terms_accepted ? 'Yes' : 'No'],
            ['Authorized signer', application.authorized_signer ? 'Yes' : 'No'],
          ]} />
        </TabsContent>

        <TabsContent value="applicant" className="mt-0 grid gap-6 xl:grid-cols-2">
          <Section title="Applicant" columns={[
            ['Name', `${application.first_name} ${application.last_name}`],
            ['Title', application.title],
            ['Email', application.email],
            ['Business phone', application.business_phone],
            ['Mobile number', application.mobile_number],
          ]} />
          <Section title="Residential / Identity" columns={[
            ['Residential phone', application.residential_phone],
            ['Date of birth', application.date_of_birth ? format(new Date(application.date_of_birth), 'MMM d, yyyy') : null],
            ['SSN', mask(application.social_security_number)],
            ['Residential country', application.residential_country],
            ['Residential address', residentialAddress(application)],
          ]} />
        </TabsContent>

        <TabsContent value="review" className="mt-0 grid gap-6 xl:grid-cols-2">
          <Section title="Review Status" columns={[
            ['Status', application.status],
            ['Submitted', date(application.submitted_at ?? application.created_at)],
            ['Reviewed', application.reviewed_at ? date(application.reviewed_at) : null],
            ['Reviewed by', application.reviewed_by],
            ['Denial reason', application.denial_reason],
          ]} />
          <Card>
            <CardHeader>
              <CardTitle>Compliance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Check label="Authorized signer" value={application.authorized_signer} />
              <Check label="Terms accepted" value={application.terms_accepted} />
              <Separator />
              <p className="text-sm text-muted-foreground">
                Sensitive identifiers are masked in the CRM detail view.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="rounded-md border bg-background p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  )
}

function Section({ title, columns }: { title: string; columns: Array<[string, string | number | null | undefined]> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        {columns.map(([label, value]) => (
          <Info key={label} label={label} value={value} />
        ))}
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">{value || 'Not provided'}</p>
    </div>
  )
}

function Check({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background p-3">
      <span className="text-sm font-medium">{label}</span>
      <Badge variant={value ? 'outline' : 'destructive'}>{value ? 'Yes' : 'No'}</Badge>
    </div>
  )
}

function ApplicationStatus({ status }: { status: Application['status'] }) {
  return (
    <StatusBadge
      status={status === 'pending' ? 'pending' : status === 'approved' ? 'success' : 'danger'}
      label={status}
    />
  )
}

function money(value: number | string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function date(value: string) {
  return format(new Date(value), 'MMM d, yyyy')
}

function mask(value?: string | null) {
  if (!value) return null
  return `•••• ${value.slice(-4)}`
}

function address(application: Application) {
  return [
    application.business_physical_address,
    application.address_line_2,
    application.city,
    application.state_province,
    application.postal_code,
  ].filter(Boolean).join(', ')
}

function residentialAddress(application: Application) {
  return [
    application.residential_address,
    application.residential_city,
    application.residential_state_province,
    application.residential_postal_code,
  ].filter(Boolean).join(', ')
}
