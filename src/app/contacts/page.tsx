'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EditableCell } from '@/components/editable-cell';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { Plus, Upload, Loader2, Trash2, X, UserCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { Contact, TeamMember } from '@/types/database';

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkOwner, setBulkOwner] = useState('');

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500', include_team: 'true' });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (ownerFilter && ownerFilter !== 'all') params.set('owner', ownerFilter);

      const response = await fetch(`/api/contacts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts);
        if (data.teamMembers) setTeamMembers(data.teamMembers);
        if (data.currentUserId) setCurrentUserId(data.currentUserId);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, ownerFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Supprimer ${selectedIds.size} contact(s) ? Cette action est irréversible.`)) return;
    setBulkDeleting(true);
    try {
      const response = await fetch('/api/contacts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selectedIds) }),
      });
      if (response.ok) {
        setSelectedIds(new Set());
        fetchContacts();
        toast.success('Contacts supprimés');
      }
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkOwner) return;
    setBulkAssigning(true);
    try {
      const assignValue = bulkOwner === 'unassigned' ? null : bulkOwner;
      const promises = Array.from(selectedIds).map(id =>
        fetch(`/api/contacts/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_to: assignValue }),
        })
      );
      await Promise.all(promises);
      toast.success(`${selectedIds.size} contact(s) assigné(s)`);
      setSelectedIds(new Set());
      setBulkOwner('');
      fetchContacts();
    } catch (error) {
      console.error('Bulk assign error:', error);
      toast.error("Erreur lors de l'assignation");
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleCellUpdate = (contactId: string, field: string, value: string | null) => {
    setContacts(prev =>
      prev.map(c =>
        c.id === contactId ? { ...c, [field]: value } : c
      )
    );
  };

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(q) ||
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.location?.toLowerCase().includes(q)
    );
  });

  const ownerCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    const key = c.assigned_to || 'unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const COLUMNS = [
    { key: 'assigned_to', label: 'Propriétaire', type: 'owner' as const },
    { key: 'status', label: 'Statut', type: 'status' as const },
    { key: 'company_name', label: 'Agence', type: 'text' as const },
    { key: 'company_domain', label: 'Site web', type: 'text' as const },
    { key: 'location', label: 'Ville', type: 'text' as const },
    { key: 'first_name', label: 'Prénom', type: 'text' as const },
    { key: 'last_name', label: 'Nom', type: 'text' as const },
    { key: 'email', label: 'Email', type: 'text' as const },
    { key: 'linkedin_url', label: 'LinkedIn', type: 'text' as const },
    { key: 'job_title', label: 'Poste', type: 'text' as const },
    { key: 'education', label: 'Formation', type: 'text' as const },
    { key: 'phone', label: 'Téléphone', type: 'text' as const },
    { key: 'notes', label: 'Notes', type: 'text' as const },
    { key: 'created_at', label: 'Ajouté', type: 'readonly-date' as const },
    { key: 'first_contact', label: '1er Contact', type: 'date' as const },
    { key: 'follow_up_1', label: 'Relance 1', type: 'readonly-date' as const },
    { key: 'follow_up_2', label: 'Relance 2', type: 'readonly-date' as const },
    { key: 'second_contact', label: '2e Contact', type: 'date' as const },
    { key: 'third_contact', label: '3e Contact', type: 'date' as const },
  ];

  return (
    <>
      <SiteHeader title="Contacts" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar — always visible */}
          <div className="flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-1">
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-[200px] h-8 text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="new">Nouveau</SelectItem>
                  <SelectItem value="contacted">Contacté</SelectItem>
                  <SelectItem value="replied">Répondu</SelectItem>
                  <SelectItem value="qualified">Qualifié</SelectItem>
                  <SelectItem value="unqualified">Non qualifié</SelectItem>
                  <SelectItem value="do_not_contact">Ne pas contacter</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Propriétaire" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous ({contacts.length})</SelectItem>
                  <SelectItem value="me">Mes contacts ({ownerCounts[currentUserId] || 0})</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.display_name || member.email.split('@')[0]} ({ownerCounts[member.user_id] || 0})
                    </SelectItem>
                  ))}
                  <SelectItem value="unassigned">Non assignés ({ownerCounts['unassigned'] || 0})</SelectItem>
                </SelectContent>
              </Select>
              <CompactStatsBar stats={[
                { label: 'Affiché', value: filtered.length },
              ]} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push('/contacts/import')}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                CSV
              </Button>
              <Button size="sm" onClick={() => router.push('/contacts/new')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nouveau
              </Button>
            </div>
          </div>

          {/* Scrollable table area — fills remaining height, scrolls both axes */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card">
              <table className="text-sm border-collapse" style={{ minWidth: '2200px' }}>
                <thead className="bg-muted/50 sticky top-0 z-10">
                  <tr className="border-b">
                    <th className="h-9 px-2 text-left text-xs font-medium w-10 sticky left-0 bg-muted/50 z-20">
                      <Checkbox
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    {COLUMNS.map(col => (
                      <th key={col.key} className="h-9 px-3 text-left text-xs font-medium whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length > 0 ? (
                    filtered.map((contact) => (
                      <tr key={contact.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-2 py-1 sticky left-0 bg-card z-10">
                          <Checkbox
                            checked={selectedIds.has(contact.id)}
                            onCheckedChange={() => toggleSelect(contact.id)}
                          />
                        </td>
                        {COLUMNS.map(col => (
                          <td key={col.key} className="px-3 py-1">
                            <EditableCell
                              contactId={contact.id}
                              field={col.key}
                              value={(contact as any)[col.key]}
                              type={col.type}
                              teamMembers={col.type === 'owner' ? teamMembers : undefined}
                              onUpdate={handleCellUpdate}
                            />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={COLUMNS.length + 1} className="h-32 text-center text-sm text-muted-foreground">
                        Aucun contact trouvé.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border shadow-lg rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} sélectionné(s)</span>
          <div className="flex items-center gap-2 border-l pl-3">
            <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={bulkOwner} onValueChange={setBulkOwner}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
                <SelectValue placeholder="Assigner à..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Non assigné</SelectItem>
                {teamMembers.map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.display_name || member.email.split('@')[0]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkAssign}
              disabled={!bulkOwner || bulkAssigning}
            >
              {bulkAssigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Assigner'}
            </Button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
            Supprimer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Désélectionner
          </Button>
        </div>
      )}
    </>
  );
}
