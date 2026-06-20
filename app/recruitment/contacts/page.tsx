import { Users } from 'lucide-react'
import { PageHeader, AwaitingData } from '../_components/placeholders'

export default function RecruitmentContactsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Contacts"
        subtitle="Recruit contact numbers and applicant information"
      />
      <AwaitingData
        icon={Users}
        title="Recruit contacts will appear here"
        message="A searchable, filterable list of recruits — names, contact numbers, and application details — like the CRM Contacts table, scoped to HR recruitment data."
      />
    </div>
  )
}
