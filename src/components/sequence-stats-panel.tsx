"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Mail, ClipboardList, Clock } from "lucide-react"

interface StepStat {
  step_id: string
  step_order: number
  step_type: string
  total_sent: number
  total_opened: number
  total_replied: number
  total_bounced: number
  variant_a: { sent: number; opened: number; replied: number; bounced: number }
  variant_b: { sent: number; opened: number; replied: number; bounced: number }
}

interface SequenceStatsPanelProps {
  sequenceId: string
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

function StatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percentage = pct(value, total)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}/{total} ({percentage}%)</span>
      </div>
      <Progress value={percentage} className={`h-1.5 ${color}`} />
    </div>
  )
}

const stepIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-3.5 w-3.5 text-blue-600" />,
  manual_task: <ClipboardList className="h-3.5 w-3.5 text-orange-600" />,
  wait: <Clock className="h-3.5 w-3.5 text-gray-600" />,
}

export function SequenceStatsPanel({ sequenceId }: SequenceStatsPanelProps) {
  const [stats, setStats] = useState<StepStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/sequences/${sequenceId}/stats`)
        if (res.ok) {
          const data = await res.json()
          setStats(data.stats || [])
        }
      } catch (error) {
        console.error("Error fetching stats:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [sequenceId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-sm text-muted-foreground text-center">
            Aucune statistique disponible. Les données apparaîtront après l&apos;envoi d&apos;emails.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {stats.map((step) => (
        <Card key={step.step_id}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              {stepIcons[step.step_type] || stepIcons.email}
              <CardTitle className="text-sm">
                Étape {step.step_order}
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">
                {step.total_sent} envoyé{step.total_sent > 1 ? "s" : ""}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatBar label="Ouvertures" value={step.total_opened} total={step.total_sent} color="" />
            <StatBar label="Réponses" value={step.total_replied} total={step.total_sent} color="" />
            <StatBar label="Bounces" value={step.total_bounced} total={step.total_sent} color="" />

            {/* A/B comparison */}
            {step.variant_b.sent > 0 && (
              <div className="border-t pt-3 mt-2 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Comparaison A/B</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <p className="font-medium">Variante A ({step.variant_a.sent} env.)</p>
                    <p>Ouvertures: {pct(step.variant_a.opened, step.variant_a.sent)}%</p>
                    <p>Réponses: {pct(step.variant_a.replied, step.variant_a.sent)}%</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">Variante B ({step.variant_b.sent} env.)</p>
                    <p>Ouvertures: {pct(step.variant_b.opened, step.variant_b.sent)}%</p>
                    <p>Réponses: {pct(step.variant_b.replied, step.variant_b.sent)}%</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
