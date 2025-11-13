"use client"

import * as React from "react"
import { Plus, Check } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface Industry {
  id: string
  name: string
  display_name: string
  user_id: string | null
}

interface IndustrySelectorProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function IndustrySelector({
  value,
  onValueChange,
  placeholder = "Sélectionnez une industrie",
  className,
}: IndustrySelectorProps) {
  const [industries, setIndustries] = React.useState<Industry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newIndustryName, setNewIndustryName] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    fetchIndustries()
  }, [])

  const fetchIndustries = async () => {
    try {
      const response = await fetch("/api/industries")
      if (response.ok) {
        const data = await response.json()
        setIndustries(data.industries || [])
      } else {
        toast.error("Erreur lors du chargement des industries")
      }
    } catch (error) {
      console.error("Error fetching industries:", error)
      toast.error("Erreur lors du chargement des industries")
    } finally {
      setLoading(false)
    }
  }

  const createCustomIndustry = async () => {
    if (!newIndustryName.trim()) {
      toast.error("Veuillez entrer un nom d'industrie")
      return
    }

    setCreating(true)
    try {
      const response = await fetch("/api/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newIndustryName.trim() }),
      })

      const data = await response.json()

      if (response.ok || data.alreadyExists) {
        toast.success(
          data.alreadyExists
            ? "Cette industrie existe déjà"
            : "Industrie créée avec succès",
          {
            duration: 3000,
          }
        )

        // Refresh industries list
        await fetchIndustries()

        // Select the newly created industry
        onValueChange(data.industry.name)

        // Close dialog and reset
        setDialogOpen(false)
        setNewIndustryName("")
      } else {
        toast.error(data.error || "Erreur lors de la création de l'industrie")
      }
    } catch (error: any) {
      console.error("Error creating industry:", error)
      toast.error("Erreur lors de la création de l'industrie")
    } finally {
      setCreating(false)
    }
  }

  const handleValueChange = (newValue: string) => {
    if (newValue === "create_new") {
      setDialogOpen(true)
    } else {
      onValueChange(newValue)
    }
  }

  const getIndustryLabel = (name: string) => {
    const industry = industries.find((ind) => ind.name === name)
    if (industry) return industry.display_name

    // Fallback labels
    const labels: { [key: string]: string } = {
      real_estate: "Immobilier",
      notary: "Notaire",
      hotel: "Hôtellerie",
      other: "Autre",
    }
    return labels[name] || name
  }

  return (
    <>
      <Select value={value} onValueChange={handleValueChange} disabled={loading}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={loading ? "Chargement..." : placeholder}>
            {value ? getIndustryLabel(value) : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {/* Predefined industries */}
          <SelectItem value="real_estate">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500" />
              Immobilier
            </div>
          </SelectItem>
          <SelectItem value="notary">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-purple-500" />
              Notaire
            </div>
          </SelectItem>
          <SelectItem value="hotel">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              Hôtellerie
            </div>
          </SelectItem>

          {/* Custom industries */}
          {industries
            .filter(
              (ind) =>
                !["real_estate", "notary", "hotel"].includes(ind.name) &&
                ind.user_id !== null
            )
            .map((industry) => (
              <SelectItem key={industry.id} value={industry.name}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-orange-500" />
                  {industry.display_name}
                </div>
              </SelectItem>
            ))}

          {/* Create new option */}
          <SelectItem value="create_new">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Plus className="h-4 w-4" />
              Créer une nouvelle industrie
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Create Industry Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une nouvelle industrie</DialogTitle>
            <DialogDescription>
              Ajoutez une nouvelle industrie personnalisée qui sera disponible partout dans l&apos;application.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="industry-name">Nom de l&apos;industrie</Label>
              <Input
                id="industry-name"
                placeholder="Ex: Restauration, Consulting, Architecture..."
                value={newIndustryName}
                onChange={(e) => setNewIndustryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    createCustomIndustry()
                  }
                }}
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Cette industrie sera automatiquement sauvegardée et réutilisable partout.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setNewIndustryName("")
              }}
              disabled={creating}
            >
              Annuler
            </Button>
            <Button onClick={createCustomIndustry} disabled={creating}>
              {creating ? (
                <>Création...</>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Créer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

