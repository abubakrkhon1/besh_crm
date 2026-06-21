import { getApplications } from '@/app/actions/applications'
import { ApplicationsTable } from '@/components/crm/ApplicationsTable'

export default async function ApplicationsPage() {
  const applications = await getApplications()

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold font-sans tracking-tight text-foreground">Fuel Card Applications</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review and manage all incoming fuel card requests from prospective fleets. Click an application to view full details and make approval decisions.
        </p>
      </div>

      <ApplicationsTable initialApplications={applications} />
    </div>
  )
}
