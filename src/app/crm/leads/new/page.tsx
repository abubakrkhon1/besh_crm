import { redirect } from 'next/navigation'
export default function NewLeadPage() {
  redirect('/crm/leads?new=1')
}
