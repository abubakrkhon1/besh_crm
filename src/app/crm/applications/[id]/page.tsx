import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, Clock3, FileCheck, Mail, Phone, TrendingUp, Truck, UserRound } from 'lucide-react'
import { getApplication, reviewApplicationAction } from '@/app/actions/applications'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
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
import { RequestDocumentsDialog } from '@/components/crm/RequestDocumentsDialog'
import { ApplicationDocumentsReview } from '@/components/crm/ApplicationDocumentsReview'
import { getStaffApplicationDocuments } from '@/app/actions/application-documents'
import { format } from 'date-fns'

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [application, documentRequests] = await Promise.all([getApplication(id), getStaffApplicationDocuments(id)])

  if (!application) notFound()
  const approveAction = reviewApplicationAction.bind(null, application.id, 'approved')
  const rejectAction = reviewApplicationAction.bind(null, application.id, 'denied')
  const applicantName = `${application.first_name} ${application.last_name}`
  const reviewStage = application.status === 'pending' ? 1 : application.status === 'needs_documents' ? 2 : application.status === 'under_review' ? 3 : 5
  const reviewLabel = application.status.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')
  const isCompleted = application.status === 'approved' || application.status === 'denied'

  return (
    <div className="animate-fade-in pb-10 font-[family-name:var(--font-inter)]">
      <div className="mb-5">
        <Link href="/crm/applications" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mb-4 -ml-2 text-sm font-medium text-primary hover:text-primary' })}>
          <ArrowLeft data-icon="inline-start" />
          Applications
        </Link>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold tracking-[-0.03em]">{application.company_legal_name}</h1>
              <ApplicationStatus status={application.status} />
              <Badge variant="outline" className="rounded-full px-4 py-1.5 text-sm font-medium">{formatLabel(application.industry)}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-muted-foreground">
              <span className="flex items-center gap-2"><UserRound className="size-4" />{applicantName}</span>
              <span className="flex items-center gap-2"><Mail className="size-4" />{application.email}</span>
              <span className="flex items-center gap-2"><Phone className="size-4" />{application.business_phone}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[250px] items-center gap-4 rounded-xl border bg-card px-5 py-3 shadow-sm">
              <div className="flex flex-1 items-center gap-2">
                {[1, 2, 3, 4, 5].map((stage) => <span key={stage} className={stage <= reviewStage ? 'size-2.5 rounded-full bg-primary' : 'size-2.5 rounded-full bg-muted-foreground/35'} />)}
              </div>
              <div className="text-right"><p className="text-[13px] font-medium text-muted-foreground">Stage {reviewStage} of 5</p><p className="text-[11px] text-muted-foreground">{reviewLabel}</p></div>
            </div>
            <RequestDocumentsDialog applicationId={application.id} disabled={isCompleted} />
            <AlertDialog>
              <AlertDialogTrigger render={<button type="button" disabled={isCompleted} className={buttonVariants({ variant: 'ghost', className: 'h-11 px-5 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive' })} />}>Reject</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the application as denied. You can still review it later from the application record.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <form action={rejectAction}>
                  <label className="mb-4 block text-sm font-medium">Reason (optional)<textarea name="denialReason" className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction type="submit" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Reject</AlertDialogAction></AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger render={<button type="button" disabled={isCompleted} className={buttonVariants({ className: 'h-11 px-5 text-sm' })} />}><CheckCircle2 data-icon="inline-start" />Approve</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve application?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will move the fleet into the customer onboarding queue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <form action={approveAction}><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction type="submit">Approve</AlertDialogAction></AlertDialogFooter></form>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Projected Spend" value={money(application.projected_spend)} icon={<TrendingUp className="size-5" />} />
        <Metric title="Total Trucks" value={String(application.total_trucks)} icon={<Truck className="size-5" />} />
        <Metric title="Total Drivers" value={String(application.total_drivers)} icon={<UserRound className="size-5" />} />
        <Metric title="Submitted" value={date(application.submitted_at ?? application.created_at)} icon={<CalendarDays className="size-5" />} />
      </div>

      <Tabs defaultValue="overview" className="w-full gap-0">
        <TabsList variant="line" className="mb-4 h-8 w-full justify-start gap-8 overflow-x-auto border-b p-0">
          {['overview', 'company', 'fleet', 'credit', 'applicant', 'documents', 'review'].map((tab) => (
            <TabsTrigger key={tab} value={tab} className="flex-none rounded-none px-5 py-0 text-sm capitalize data-active:bg-transparent data-active:text-primary after:bottom-0 after:bg-primary focus-visible:ring-0">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
          <Card className="min-h-[380px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-base"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"><FileCheck className="size-4" /></span>Application Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-12 gap-y-0 sm:grid-cols-2">
              <Info label="Legal name" value={application.company_legal_name} />
              <Info label="Doing business as" value={application.doing_business_as} />
              <Info label="Account type" value={formatLabel(application.account_type)} />
              <Info label="Payment method" value={formatLabel(application.payment_method)} />
              <Info label="Legal structure" value={formatLabel(application.legal_structure)} />
              <Info label="Year established" value={String(application.year_established)} />
              <div className="sm:col-span-2">
                <Info label="Business description" value={application.business_description} />
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-[380px]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-base"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary"><Clock3 className="size-4" /></span>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <TimelineItem icon={<Building2 className="size-4" />} title="Application created" dateValue={date(application.created_at)} first />
              <TimelineItem icon={<span className="size-2.5 rounded-full bg-primary" />} title="Submitted for review" dateValue={date(application.submitted_at ?? application.created_at)} description="Application entered underwriting queue." />
              {application.reviewed_at && <TimelineItem icon={<CheckCircle2 className="size-4" />} title="Review completed" dateValue={date(application.reviewed_at)} description={`Decision: ${formatLabel(application.status)}`} />}
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

        <TabsContent value="documents" className="mt-0">
          <ApplicationDocumentsReview requests={documentRequests} />
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
    <Card className="min-h-[108px] py-0">
      <CardContent className="flex h-full items-center gap-4 p-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight">{value}</p>
        </div>
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
    <div className="min-w-0 border-b py-4">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-[15px] font-medium">{value || 'Not provided'}</p>
    </div>
  )
}

function TimelineItem({ icon, title, dateValue, description, first = false }: { icon: React.ReactNode; title: string; dateValue: string; description?: string; first?: boolean }) {
  return <div className="relative flex min-h-[92px] gap-4 pb-4">
    <div className="relative flex w-10 shrink-0 justify-center">
      {!first && <span className="absolute -top-5 h-5 w-px bg-border" />}
      <span className="flex size-10 items-center justify-center rounded-full border bg-primary/10 text-primary">{icon}</span>
      <span className="absolute top-10 h-[52px] w-px bg-border" />
    </div>
    <div className="flex min-w-0 flex-1 items-start justify-between gap-4 pt-2.5">
      <div><p className="font-medium">{title}</p>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>
      <p className="shrink-0 text-sm text-muted-foreground">{dateValue}</p>
    </div>
  </div>
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
      status={status === 'approved' ? 'success' : status === 'denied' ? 'danger' : status === 'under_review' ? 'info' : 'pending'}
      label={formatLabel(status)}
      className="h-8 px-4 text-sm capitalize"
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

function formatLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}
