'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Mail, Building2, User, AlertTriangle, UserCheck } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ContactStatusBadge } from '@/components/contact-status-badge';

const VALID_STATUSES = ['new', 'contacted', 'replied', 'qualified', 'unqualified', 'do_not_contact'] as const;

const STATUS_ALIASES: Record<string, string> = {
  'nouveau': 'new',
  'new': 'new',
  'no_contacted': 'new',
  'not_contacted': 'new',
  'contacté': 'contacted',
  'contacte': 'contacted',
  'contacted': 'contacted',
  'répondu': 'replied',
  'repondu': 'replied',
  'replied': 'replied',
  'qualifié': 'qualified',
  'qualifie': 'qualified',
  'qualified': 'qualified',
  'non qualifié': 'unqualified',
  'non qualifie': 'unqualified',
  'unqualified': 'unqualified',
  'ne pas contacter': 'do_not_contact',
  'do_not_contact': 'do_not_contact',
  'dnc': 'do_not_contact',
};

function normalizeStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.toLowerCase().trim();
  return STATUS_ALIASES[normalized] || (VALID_STATUSES.includes(normalized as any) ? normalized : undefined);
}

interface ParsedContact {
  email: string;
  first_name?: string;
  firstName?: string;
  prénom?: string;
  last_name?: string;
  lastName?: string;
  nom?: string;
  company_name?: string;
  companyName?: string;
  entreprise?: string;
  société?: string;
  [key: string]: any;
}

interface DuplicateInfo {
  email: string;
  first_name: string | null;
  last_name: string | null;
  owner_name: string | null;
  created_by: string | null;
}

const KNOWN_HEADERS = [
  'email', 'e-mail', 'first_name', 'firstname', 'prénom', 'prenom',
  'last_name', 'lastname', 'nom', 'company_name', 'companyname',
  'entreprise', 'société', 'status', 'statut',
];

// Check if the first row looks like headers (contains known field names)
function hasHeaderRow(keys: string[]): boolean {
  const lowerKeys = keys.map(k => k.toLowerCase().trim());
  return KNOWN_HEADERS.some(h => lowerKeys.includes(h));
}

// Auto-detect headers in EN/FR
function normalizeContact(raw: ParsedContact): ParsedContact {
  const rawStatus = raw.status || raw.Status || raw.STATUS || raw.statut || raw.Statut || raw.STATUT || undefined;
  return {
    ...raw,
    email: (raw.email || raw.Email || raw.EMAIL || raw['e-mail'] || raw['E-mail'] || '').toLowerCase().trim(),
    first_name: raw.first_name || raw.firstName || raw.prénom || raw.Prénom || raw['First Name'] || raw['first name'] || undefined,
    last_name: raw.last_name || raw.lastName || raw.nom || raw.Nom || raw['Last Name'] || raw['last name'] || undefined,
    company_name: raw.company_name || raw.companyName || raw.entreprise || raw.Entreprise || raw.société || raw.Société || raw['Company Name'] || raw['company name'] || raw.company || raw.Company || undefined,
    status: normalizeStatus(rawStatus),
  };
}

// Auto-map columns for headerless CSVs by detecting content patterns
function autoMapRows(rows: string[][]): ParsedContact[] {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const linkedinRegex = /linkedin\.com/i;
  const allStatusValues = [...Object.keys(STATUS_ALIASES), ...VALID_STATUSES];

  if (rows.length === 0 || !rows[0]) return [];

  const colCount = rows[0].length;
  const sampleRows = rows.slice(0, Math.min(5, rows.length));

  // Detect key columns by content
  let emailCol = -1;
  let linkedinCol = -1;
  let statusCol = -1;

  for (let col = 0; col < colCount; col++) {
    const values = sampleRows.map(r => (r[col] || '').trim()).filter(Boolean);
    if (values.length === 0) continue;

    if (emailCol === -1 && values.some(v => emailRegex.test(v))) {
      emailCol = col;
    } else if (linkedinCol === -1 && values.some(v => linkedinRegex.test(v))) {
      linkedinCol = col;
    } else if (statusCol === -1 && values.every(v => allStatusValues.includes(v.toLowerCase().replace(/\s+/g, '_')))) {
      statusCol = col;
    }
  }

  if (emailCol === -1) return []; // Can't import without email column

  return rows.map(row => {
    const contact: ParsedContact = {
      email: (row[emailCol] || '').trim(),
    };

    // Map status if detected
    if (statusCol >= 0) {
      contact.status = normalizeStatus((row[statusCol] || '').trim()) || undefined;
    }

    // Map linkedin if detected
    if (linkedinCol >= 0) {
      contact.linkedin_url = (row[linkedinCol] || '').trim() || undefined;
    }

    // Map name columns: the 2 columns immediately before email are typically first_name, last_name
    if (emailCol >= 2) {
      contact.first_name = (row[emailCol - 2] || '').trim() || undefined;
      contact.last_name = (row[emailCol - 1] || '').trim() || undefined;
    } else if (emailCol >= 1) {
      contact.first_name = (row[emailCol - 1] || '').trim() || undefined;
    }

    // Map company: typically after status, or 3+ columns before email
    if (statusCol >= 0 && statusCol + 1 < emailCol - 2) {
      contact.company_name = (row[statusCol + 1] || '').trim() || undefined;
    } else if (emailCol >= 5) {
      contact.company_name = (row[emailCol - 5] || '').trim() || undefined;
    }

    // Map location: column between company and first_name
    if (emailCol >= 3 && statusCol >= 0 && statusCol + 2 < emailCol - 2) {
      contact.location = (row[emailCol - 3] || '').trim() || undefined;
    }

    // Map job_title: typically 2 columns after email (after linkedin)
    if (linkedinCol >= 0 && linkedinCol + 1 < colCount) {
      contact.job_title = (row[linkedinCol + 1] || '').trim() || undefined;
    }

    // Map remaining columns after job_title: phone, education, notes
    const jobTitleCol = linkedinCol >= 0 ? linkedinCol + 1 : emailCol + 2;
    if (jobTitleCol + 1 < colCount) contact.phone = (row[jobTitleCol + 1] || '').trim() || undefined;
    if (jobTitleCol + 2 < colCount) contact.education = (row[jobTitleCol + 2] || '').trim() || undefined;
    if (jobTitleCol + 3 < colCount) contact.notes = (row[jobTitleCol + 3] || '').trim() || undefined;

    return contact;
  });
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [validContacts, setValidContacts] = useState<ParsedContact[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [csvDuplicates, setCsvDuplicates] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'duplicates'>('upload');

  // Database duplicate state
  const [dbDuplicates, setDbDuplicates] = useState<DuplicateInfo[]>([]);
  const [newCount, setNewCount] = useState(0);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const processContacts = (contacts: ParsedContact[]) => {
    const valid: ParsedContact[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    let dupeCount = 0;

    contacts.forEach((contact) => {
      const email = (contact.email || '').toLowerCase().trim();
      if (!email) { invalid.push('(empty email)'); return; }
      if (!validateEmail(email)) { invalid.push(email); return; }
      if (seen.has(email)) { dupeCount++; return; }
      seen.add(email);
      valid.push({ ...contact, email });
    });

    return { valid, invalid, dupeCount };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Veuillez sélectionner un fichier CSV');
      return;
    }

    setFile(selectedFile);

    // First pass: parse without headers to get raw arrays
    Papa.parse(selectedFile, {
      header: false,
      skipEmptyLines: true,
      complete: (rawResults) => {
        const rows = rawResults.data as string[][];
        if (rows.length === 0) {
          toast.error('Fichier vide');
          return;
        }

        // Check if first row looks like headers
        const firstRow = rows[0];
        const isHeaderRow = hasHeaderRow(firstRow);

        let contacts: ParsedContact[];

        if (isHeaderRow) {
          // Re-parse with headers
          const headerKeys = firstRow;
          const dataRows = rows.slice(1);
          contacts = dataRows.map(row => {
            const obj: ParsedContact = { email: '' };
            headerKeys.forEach((key, i) => {
              if (key && row[i] !== undefined) obj[key.trim()] = row[i];
            });
            return normalizeContact(obj);
          });
        } else {
          // No headers: auto-detect columns by content
          contacts = autoMapRows(rows);
        }

        const { valid, invalid, dupeCount } = processContacts(contacts);

        setValidContacts(valid);
        setInvalidEmails(invalid);
        setCsvDuplicates(dupeCount);
        setStep('preview');

        if (valid.length > 0) {
          toast.success(`${valid.length} contacts valides trouvés${!isHeaderRow ? ' (colonnes auto-détectées)' : ''}`);
        } else {
          toast.error('Aucun contact valide trouvé. Vérifiez le format du fichier.');
        }
      },
      error: (error) => {
        toast.error(`Erreur lors de la lecture du fichier: ${error.message}`);
      },
    });
  };

  const handleCheckDuplicates = async () => {
    if (validContacts.length === 0) return;

    setChecking(true);
    try {
      const response = await fetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validContacts,
          check_duplicates: true,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.duplicates && data.duplicates.length > 0) {
          setDbDuplicates(data.duplicates);
          setNewCount(data.new_count);
          setStep('duplicates');
        } else {
          // No duplicates, proceed directly
          await handleImport(false);
        }
      } else {
        toast.error(data.error || 'Erreur lors de la vérification');
      }
    } catch {
      toast.error('Erreur lors de la vérification des doublons');
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async (skipDuplicates: boolean) => {
    if (validContacts.length === 0) {
      toast.error('Aucun contact valide à importer');
      return;
    }

    setUploading(true);
    try {
      const response = await fetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validContacts,
          skip_duplicates: skipDuplicates,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`${data.imported} contacts importés${data.skipped > 0 ? `, ${data.skipped} ignoré(s)` : ''}`);
        router.push('/contacts');
      } else {
        toast.error(data.error || "Erreur lors de l'importation");
      }
    } catch {
      toast.error("Erreur lors de l'importation des contacts");
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileUpload({ target: fileInputRef.current } as any);
      }
    } else {
      toast.error('Veuillez déposer un fichier CSV');
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setValidContacts([]);
    setInvalidEmails([]);
    setCsvDuplicates(0);
    setDbDuplicates([]);
    setNewCount(0);
  };

  return (
    <>
      <SiteHeader title="Importer des contacts" />
      <div className="page-container">
        <div className="page-content">

          {step === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle>Télécharger un fichier CSV</CardTitle>
                <CardDescription>
                  Format auto-détecté: email, firstName/prénom, lastName/nom, companyName/entreprise, status/statut
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">
                    Glissez-déposez votre fichier CSV ici
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">ou cliquez pour sélectionner</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button type="button" variant="outline" size="sm">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    Sélectionner un fichier
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'preview' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Contacts valides</span>
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <div className="text-xl font-bold text-green-600">{validContacts.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Emails invalides</span>
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="text-xl font-bold text-red-600">{invalidEmails.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Doublons CSV</span>
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                    </div>
                    <div className="text-xl font-bold text-yellow-600">{csvDuplicates}</div>
                  </CardContent>
                </Card>
              </div>

              {invalidEmails.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    {invalidEmails.length} email(s) invalide(s) ignorés
                  </AlertDescription>
                </Alert>
              )}

              <Card className="flex-1 min-h-0 flex flex-col">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Aperçu</CardTitle>
                  <CardDescription className="text-xs">
                    {validContacts.length > 10
                      ? `10 premiers sur ${validContacts.length}`
                      : `${validContacts.length} contact(s)`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex-1 min-h-0 overflow-auto">
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-xs w-8">#</TableHead>
                          <TableHead className="text-xs">Contact</TableHead>
                          <TableHead className="text-xs">Entreprise</TableHead>
                          <TableHead className="text-xs">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validContacts.slice(0, 10).map((contact, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-xs text-muted-foreground py-1.5">{index + 1}</TableCell>
                            <TableCell className="py-1.5">
                              <div className="text-sm font-medium">
                                {contact.first_name || '—'} {contact.last_name || ''}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              {contact.company_name ? (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  {contact.company_name}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">&mdash;</span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <ContactStatusBadge status={contact.status || 'new'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {validContacts.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1.5 text-center">
                      ... et {validContacts.length - 10} contact(s) supplémentaire(s)
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={resetAll}>
                  Annuler
                </Button>
                <Button size="sm" onClick={handleCheckDuplicates} disabled={checking}>
                  {checking ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Vérification...
                    </>
                  ) : (
                    `Importer ${validContacts.length} contact${validContacts.length > 1 ? 's' : ''}`
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'duplicates' && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{dbDuplicates.length} contact(s)</strong> existent déjà dans la base de données.{' '}
                  <strong>{newCount}</strong> nouveau(x) contact(s) seront importé(s).
                </AlertDescription>
              </Alert>

              <Card className="flex-1 min-h-0 flex flex-col">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Contacts existants ({dbDuplicates.length})</CardTitle>
                  <CardDescription className="text-xs">
                    Ces contacts ne seront pas ré-importés
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex-1 min-h-0 overflow-auto">
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Nom</TableHead>
                          <TableHead className="text-xs">Propriétaire</TableHead>
                          <TableHead className="text-xs">Ajouté par</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dbDuplicates.map((dup, i) => (
                          <TableRow key={i}>
                            <TableCell className="py-1.5">
                              <span className="text-xs font-mono">{dup.email}</span>
                            </TableCell>
                            <TableCell className="py-1.5 text-sm">
                              {dup.first_name || ''} {dup.last_name || ''}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {dup.owner_name ? (
                                <Badge variant="secondary" className="text-xs">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  {dup.owner_name}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">Non assigné</span>
                              )}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground">
                              {dup.created_by || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={resetAll}>
                  Annuler
                </Button>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleImport(true)}
                    disabled={uploading || newCount === 0}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Importation...
                      </>
                    ) : (
                      `Ignorer les doublons (importer ${newCount} nouveaux)`
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
