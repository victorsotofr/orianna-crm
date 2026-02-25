import { CompactStatsBar } from "@/components/compact-stats-bar"

interface SectionCardsProps {
  stats?: {
    totalContacts: number
    emailsSentToday?: number
    emailsToday?: number
    activeSequences?: number
    replyRate?: number
    myContacts?: number
    myEmailsToday?: number
    myReplyRate?: number
    myActiveEnrollments?: number
  }
  variant?: 'team' | 'personal'
}

export function SectionCards({ stats, variant = 'team' }: SectionCardsProps) {
  if (variant === 'personal') {
    return (
      <div className="px-4 lg:px-6">
        <CompactStatsBar stats={[
          { label: 'Mes Contacts', value: stats?.myContacts || 0 },
          { label: "Emails aujourd'hui", value: stats?.myEmailsToday || 0 },
          { label: 'Inscriptions', value: stats?.myActiveEnrollments || 0 },
          { label: 'Taux réponse', value: `${stats?.myReplyRate || 0}%` },
        ]} />
      </div>
    )
  }

  return (
    <div className="px-4 lg:px-6">
      <CompactStatsBar stats={[
        { label: 'Contacts', value: stats?.totalContacts || 0 },
        { label: 'Séquences actives', value: stats?.activeSequences || 0 },
        { label: "Emails aujourd'hui", value: stats?.emailsToday || stats?.emailsSentToday || 0 },
        { label: 'Taux réponse', value: `${stats?.replyRate || 0}%` },
      ]} />
    </div>
  )
}
