import { Bell } from 'lucide-react'
import { PageHeader, AwaitingData } from '../_components/placeholders'

export default function RecruitmentNotificationsPage() {
  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Notifications"
        subtitle="New incoming recruits and HR alerts"
      />
      <AwaitingData
        icon={Bell}
        title="Recruitment notifications will appear here"
        message="HR gets a notification each time a new recruit submits the recruitment form — plus pipeline alerts (interview due, offer pending). Wired once the recruitment schema and form intake are connected."
      />
    </div>
  )
}
