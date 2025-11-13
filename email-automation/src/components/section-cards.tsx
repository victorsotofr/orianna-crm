import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface SectionCardsProps {
  stats?: {
    totalContacts: number
    emailsSentToday: number
    totalEmailsSent: number
    averageSendingRate: number
  }
}

export function SectionCards({ stats }: SectionCardsProps) {
  const cards = [
    {
      title: "Total Contacts",
      value: stats?.totalContacts || 0,
      description: "Contacts importés",
    },
    {
      title: "Emails Aujourd'hui",
      value: stats?.emailsSentToday || 0,
      description: "Envoyés aujourd'hui",
    },
    {
      title: "Total Envoyés",
      value: stats?.totalEmailsSent || 0,
      description: "Tous les emails",
    },
    {
      title: "Moyenne/Jour",
      value: stats?.averageSendingRate || 0,
      description: "Emails par jour",
    },
  ]

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

