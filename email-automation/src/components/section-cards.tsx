import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface SectionCardsProps {
  stats?: {
    totalContacts: number
    emailsSentToday?: number
    emailsToday?: number
    totalEmailsSent?: number
    totalEmails?: number
    averageSendingRate?: number
    activeSequences?: number
    replyRate?: number
    activeEnrollments?: number
    // My stats
    myContacts?: number
    myEmailsToday?: number
    myTotalEmails?: number
    myReplyRate?: number
    myActiveEnrollments?: number
  }
  variant?: 'team' | 'personal'
}

export function SectionCards({ stats, variant = 'team' }: SectionCardsProps) {
  const teamCards = [
    {
      title: "Total Contacts",
      value: stats?.totalContacts || 0,
      description: "Contacts dans le CRM",
    },
    {
      title: "Séquences Actives",
      value: stats?.activeSequences || 0,
      description: "Séquences en cours",
    },
    {
      title: "Emails Aujourd'hui",
      value: stats?.emailsToday || stats?.emailsSentToday || 0,
      description: "Envoyés aujourd'hui",
    },
    {
      title: "Taux de Réponse",
      value: `${stats?.replyRate || 0}%`,
      description: "Contacts ayant répondu",
    },
  ]

  const personalCards = [
    {
      title: "Mes Contacts",
      value: stats?.myContacts || 0,
      description: "Contacts assignés",
    },
    {
      title: "Mes Emails Aujourd'hui",
      value: stats?.myEmailsToday || 0,
      description: "Envoyés aujourd'hui",
    },
    {
      title: "Inscriptions Actives",
      value: stats?.myActiveEnrollments || 0,
      description: "Dans mes séquences",
    },
    {
      title: "Mon Taux de Réponse",
      value: `${stats?.myReplyRate || 0}%`,
      description: "Sur mes contacts",
    },
  ]

  const cards = variant === 'personal' ? personalCards : teamCards

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index} className="@container/card">
          <CardHeader className="pb-3">
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {card.value}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  )
}
