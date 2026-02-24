'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/site-header';
import { ContactsListTable } from '@/components/contacts-list-table';
import { Plus, Upload } from 'lucide-react';
import type { Contact } from '@/types/database';

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchContacts();
  }, [statusFilter]);

  const fetchContacts = async () => {
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
  };

  return (
    <>
      <SiteHeader title="Contacts" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tous les contacts</h2>
              <p className="text-sm text-muted-foreground">
                {contacts.length} contact(s) au total
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => router.push('/contacts/import')}>
                <Upload className="mr-2 h-4 w-4" />
                Importer CSV
              </Button>
              <Button onClick={() => router.push('/contacts/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Nouveau contact
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center min-h-[400px]">
              <p className="text-muted-foreground">Chargement...</p>
            </div>
          ) : (
            <ContactsListTable
              data={contacts}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          )}
        </div>
      </div>
    </>
  );
}
