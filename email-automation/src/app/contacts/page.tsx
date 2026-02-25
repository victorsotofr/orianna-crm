'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { ContactDetailSheet } from '@/components/contact-detail-sheet';
import { CompactStatsBar } from '@/components/compact-stats-bar';
import { SiteHeader } from '@/components/site-header';
import { Plus, Upload, Loader2, Mail, Building2 } from 'lucide-react';
import type { Contact } from '@/types/database';

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Sheet state
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const response = await fetch(`/api/contacts?${params}`);
      if (response.ok) {
        const data = await response.json();
        setContacts(data.contacts);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

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

  const statusCounts = contacts.reduce<Record<string, number>>((acc, c) => {
    const s = c.status || 'new';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <SiteHeader title="Contacts" />
      <div className="page-container">
        <div className="page-content">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <Input
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs h-8 text-sm"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="Tous les statuts" />
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
              <CompactStatsBar stats={[
                { label: 'Total', value: contacts.length },
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

          {/* Table - fills remaining height */}
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
                    <TableHead className="text-xs">Industrie</TableHead>
                    <TableHead className="text-xs">Téléphone</TableHead>
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
                          {contact.industry ? (
                            <Badge variant="outline" className="text-xs">{contact.industry}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-sm font-mono">
                          {contact.phone || <span className="text-muted-foreground text-xs">&mdash;</span>}
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

      {/* Detail sheet */}
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
