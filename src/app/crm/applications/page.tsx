import { getApplications } from '@/app/actions/applications'
import { ApplicationsTable } from '@/components/crm/ApplicationsTable'

export default async function ApplicationsPage() {
  const applications = await getApplications()

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Fuel Card Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review incoming fleet requests, documents, and underwriting decisions.
        </p>
      </div>

      <ApplicationsTable initialApplications={applications} />
    </div>
  )
}
