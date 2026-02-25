"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreHorizontal, Pause, Play, UserX, CheckCircle, User } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { fr } from "date-fns/locale"
import type { SequenceEnrollment, Contact } from "@/types/database"

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  active: { label: "Actif", variant: "default" },
  paused: { label: "Pausé", variant: "secondary" },
  completed: { label: "Terminé", variant: "outline" },
  replied: { label: "Répondu", variant: "default" },
  bounced: { label: "Bounced", variant: "destructive" },
  unenrolled: { label: "Désinscrit", variant: "secondary" },
}

interface EnrollmentWithContact extends SequenceEnrollment {
  contacts?: Contact;
}

interface EnrollmentTableProps {
  enrollments: EnrollmentWithContact[]
  totalSteps: number
  onAction: (enrollmentId: string, action: string) => void
}

export function EnrollmentTable({ enrollments, totalSteps, onAction }: EnrollmentTableProps) {
  if (enrollments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Aucun contact inscrit dans cette séquence
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Étape</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Inscrit</TableHead>
            <TableHead>Prochaine action</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map((enrollment) => {
            const config = statusConfig[enrollment.status] || statusConfig.active
            return (
              <TableRow key={enrollment.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">
                        {enrollment.contacts?.first_name || ''} {enrollment.contacts?.last_name || ''}
                      </div>
                      <div className="text-xs text-muted-foreground">{enrollment.contacts?.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm font-mono">
                    {enrollment.current_step_order}/{totalSteps}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={config.variant}>{config.label}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(enrollment.enrolled_at), { addSuffix: true, locale: fr })}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {enrollment.next_action_at
                    ? formatDistanceToNow(new Date(enrollment.next_action_at), { addSuffix: true, locale: fr })
                    : '—'}
                </TableCell>
                <TableCell>
                  {enrollment.status === 'active' || enrollment.status === 'paused' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {enrollment.status === 'active' && (
                          <DropdownMenuItem onClick={() => onAction(enrollment.id, 'pause')}>
                            <Pause className="mr-2 h-4 w-4" />
                            Mettre en pause
                          </DropdownMenuItem>
                        )}
                        {enrollment.status === 'paused' && (
                          <DropdownMenuItem onClick={() => onAction(enrollment.id, 'resume')}>
                            <Play className="mr-2 h-4 w-4" />
                            Reprendre
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => onAction(enrollment.id, 'complete_manual_step')}>
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Valider étape manuelle
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(enrollment.id, 'unenroll')} className="text-destructive">
                          <UserX className="mr-2 h-4 w-4" />
                          Désinscrire
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
