import { getApplications } from '@/app/actions/applications'
import { ApplicationsTable } from '@/components/crm/ApplicationsTable'

export default async function ApplicationsPage() {
  const applications = await getApplications()

  return <ApplicationsTable initialApplications={applications} />
}
