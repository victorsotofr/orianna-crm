'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { ContactDetailSheet } from '@/components/contact-detail-sheet';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { Plus, Upload, Loader2, Mail, Building2 } from 'lucide-react';
import type { Contact, TeamMember } from '@/types/database';

const OWNER_COLORS: Record<string, string> = {};
const COLOR_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
];

function getOwnerColor(userId: string, index: number): string {
  if (!OWNER_COLORS[userId]) {
    OWNER_COLORS[userId] = COLOR_PALETTE[index % COLOR_PALETTE.length];
  }
  return OWNER_COLORS[userId];
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Sheet state
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const openContact = (id: string) => {
    setSelectedContactId(id);
    setSheetOpen(true);
  };

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(q) ||
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q)
    );
  });

  const getOwnerName = (assignedTo: string | null) => {
    if (!assignedTo) return null;
    const member = teamMembers.find(m => m.user_id === assignedTo);
    return member?.display_name || member?.email?.split('@')[0] || null;
  };

  const getOwnerBadge = (assignedTo: string | null) => {
    if (!assignedTo) return <span className="text-muted-foreground text-xs">Non assigné</span>;
    const member = teamMembers.find(m => m.user_id === assignedTo);
    if (!member) return <span className="text-muted-foreground text-xs">—</span>;
    const idx = teamMembers.indexOf(member);
    const name = member.display_name || member.email.split('@')[0];
    return (
      <Badge variant="secondary" className={`text-xs ${getOwnerColor(member.user_id, idx)}`}>
        {name}
      </Badge>
    );
  };

  // Ownership stats
  const ownerCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    const key = c.assigned_to || 'unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <SiteHeader title="Contacts" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
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

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Contact</TableHead>
                    <TableHead className="text-xs">Entreprise</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs">Propriétaire</TableHead>
                    <TableHead className="text-xs">Industrie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length > 0 ? (
                    filtered.map((contact) => (
                      <TableRow
                        key={contact.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openContact(contact.id)}
                      >
                        <TableCell className="py-2">
                          <div>
                            <div className="text-sm font-medium">
                              {contact.first_name || ''} {contact.last_name || ''}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          {contact.company_name ? (
                            <div className="flex items-center gap-1.5 text-sm">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              {contact.company_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2">
                          <ContactStatusBadge status={contact.status || 'new'} />
                        </TableCell>
                        <TableCell className="py-2">
                          {getOwnerBadge(contact.assigned_to)}
                        </TableCell>
                        <TableCell className="py-2">
                          {contact.industry ? (
                            <Badge variant="outline" className="text-xs">{contact.industry}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">&mdash;</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-sm text-muted-foreground">
                        Aucun contact trouvé.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onContactUpdated={fetchContacts}
        onContactDeleted={fetchContacts}
      />
    </>
  );
}
