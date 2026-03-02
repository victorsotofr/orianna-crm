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
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Mail, Building2, AlertTriangle, UserCheck, Brain, Search, Sparkles, ArrowRight } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { ContactStatusBadge } from '@/components/contact-status-badge';
import { useTranslation } from '@/lib/i18n';
import { apiFetch } from '@/lib/api';

const VALID_STATUSES = ['new', 'contacted', 'engaged', 'qualified', 'meeting_scheduled', 'opportunity', 'customer', 'lost', 'do_not_contact'] as const;

const STATUS_ALIASES: Record<string, string> = {
  'nouveau': 'new',
  'new': 'new',
  'no_contacted': 'new',
  'not_contacted': 'new',
  'contacté': 'contacted',
  'contacte': 'contacted',
  'contacted': 'contacted',
  'engagé': 'engaged',
  'engage': 'engaged',
  'engaged': 'engaged',
  'répondu': 'engaged',
  'repondu': 'engaged',
  'replied': 'engaged',
  'qualifié': 'qualified',
  'qualifie': 'qualified',
  'qualified': 'qualified',
  'rdv booké': 'meeting_scheduled',
  'rdv booke': 'meeting_scheduled',
  'meeting_scheduled': 'meeting_scheduled',
  'meeting scheduled': 'meeting_scheduled',
  'opportunité': 'opportunity',
  'opportunite': 'opportunity',
  'opportunity': 'opportunity',
  'client': 'customer',
  'customer': 'customer',
  'perdu': 'lost',
  'lost': 'lost',
  'non qualifié': 'lost',
  'non qualifie': 'lost',
  'unqualified': 'lost',
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
  email?: string;
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

  if (emailCol === -1) return []; // Can't auto-map without email column

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
  const { t } = useTranslation();

  const [file, setFile] = useState<File | null>(null);
  const [validContacts, setValidContacts] = useState<ParsedContact[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [noEmailCount, setNoEmailCount] = useState<number>(0);
  const [csvDuplicates, setCsvDuplicates] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'duplicates' | 'done'>('upload');

  // Database duplicate state
  const [dbDuplicates, setDbDuplicates] = useState<DuplicateInfo[]>([]);
  const [newCount, setNewCount] = useState(0);

  // Post-import action state
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [scoringProgress, setScoringProgress] = useState(0);
  const [scoringTotal, setScoringTotal] = useState(0);
  const [scoringRunning, setScoringRunning] = useState(false);
  const [scoringDone, setScoringDone] = useState(false);
  const [enrichingImported, setEnrichingImported] = useState(false);
  const [enrichingDone, setEnrichingDone] = useState(false);
  const [personalizingProgress, setPersonalizingProgress] = useState(0);
  const [personalizingTotal, setPersonalizingTotal] = useState(0);
  const [personalizingRunning, setPersonalizingRunning] = useState(false);
  const [personalizingDone, setPersonalizingDone] = useState(false);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const processContacts = (contacts: ParsedContact[]) => {
    const valid: ParsedContact[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    let dupeCount = 0;
    let noEmailCount = 0;

    contacts.forEach((contact) => {
      const email = (contact.email || '').toLowerCase().trim();

      if (!email) {
        // Allow contacts without email if they have at least a name
        const hasName = (contact.first_name || contact.firstName || contact.prénom || '') ||
                        (contact.last_name || contact.lastName || contact.nom || '');
        if (hasName) {
          noEmailCount++;
          valid.push({ ...contact, email: undefined });
        } else {
          invalid.push('(empty email)');
        }
        return;
      }

      if (!validateEmail(email)) { invalid.push(email); return; }
      if (seen.has(email)) { dupeCount++; return; }
      seen.add(email);
      valid.push({ ...contact, email });
    });

    return { valid, invalid, dupeCount, noEmailCount };
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error(t.import.validation.selectFile);
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
          toast.error(t.import.validation.emptyFile);
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

        const { valid, invalid, dupeCount, noEmailCount: noEmail } = processContacts(contacts);

        setValidContacts(valid);
        setInvalidEmails(invalid);
        setNoEmailCount(noEmail);
        setCsvDuplicates(dupeCount);
        setStep('preview');

        if (valid.length > 0) {
          toast.success(t.import.toasts.validFound(valid.length, !isHeaderRow));
        } else {
          toast.error(t.import.toasts.noValid);
        }
      },
      error: (error) => {
        toast.error(t.import.toasts.readError(error.message));
      },
    });
  };

  const handleCheckDuplicates = async () => {
    if (validContacts.length === 0) return;

    setChecking(true);
    try {
      const response = await apiFetch('/api/contacts/upload', {
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
        toast.error(data.error || t.common.networkError);
      }
    } catch {
      toast.error(t.common.networkError);
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async (skipDuplicates: boolean) => {
    if (validContacts.length === 0) {
      toast.error(t.import.toasts.noValid);
      return;
    }

    setUploading(true);
    try {
      const response = await apiFetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validContacts,
          skip_duplicates: skipDuplicates,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(t.import.toasts.imported(data.imported, data.skipped));
        if (data.importedIds && data.importedIds.length > 0) {
          setImportedIds(data.importedIds);
          setScoringTotal(data.importedIds.length);
          setScoringProgress(0);
          setStep('done');
        } else {
          router.push('/contacts');
        }
      } else {
        toast.error(data.error || t.common.networkError);
      }
    } catch {
      toast.error(t.common.networkError);
    } finally {
      setUploading(false);
    }
  };

  const handleEnrichImported = async (ids: string[]) => {
    setEnrichingImported(true);
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        await apiFetch('/api/contacts/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds: batch }),
        });
      }
      toast.success(t.import.done.enrich.started);
      setEnrichingDone(true);
    } catch {
      toast.error(t.contacts.enrich.error);
    } finally {
      setEnrichingImported(false);
    }
  };

  const startScoring = async (ids: string[]) => {
    setScoringRunning(true);
    const batchSize = 5;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        await apiFetch('/api/ai/score-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds: batch }),
        });
      } catch {
        // Continue with next batch even if one fails
      }
      setScoringProgress(Math.min(i + batchSize, ids.length));
    }
    toast.success(t.import.done.scoring.done);
    setScoringRunning(false);
    setScoringDone(true);
  };

  const startPersonalizing = async (ids: string[]) => {
    setPersonalizingRunning(true);
    setPersonalizingTotal(ids.length);
    const batchSize = 5;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      try {
        await apiFetch('/api/ai/personalize-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactIds: batch }),
        });
      } catch {
        // Continue with next batch even if one fails
      }
      setPersonalizingProgress(Math.min(i + batchSize, ids.length));
    }
    toast.success(t.import.done.personalize.done);
    setPersonalizingRunning(false);
    setPersonalizingDone(true);
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
      toast.error(t.import.validation.dropCsv);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setValidContacts([]);
    setInvalidEmails([]);
    setNoEmailCount(0);
    setCsvDuplicates(0);
    setDbDuplicates([]);
    setNewCount(0);
  };

  return (
    <>
      <SiteHeader title={t.import.title} />
      <div className="page-container">
        <div className="page-content">

          {step === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle>{t.import.upload.title}</CardTitle>
                <CardDescription>
                  {t.import.upload.format}
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
                    {t.import.upload.dropzone}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">{t.import.upload.orClick}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button type="button" variant="outline" size="sm">
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    {t.import.upload.selectFile}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'preview' && (
            <>
              <div className={`grid gap-3 ${noEmailCount > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{t.import.preview.validContacts}</span>
                      <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                    </div>
                    <div className="text-xl font-bold text-green-600">{validContacts.length}</div>
                  </CardContent>
                </Card>
                {noEmailCount > 0 && (
                  <Card>
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">{t.import.preview.noEmail}</span>
                        <Mail className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <div className="text-xl font-bold text-blue-600">{noEmailCount}</div>
                    </CardContent>
                  </Card>
                )}
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{t.import.preview.invalidEmails}</span>
                      <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="text-xl font-bold text-red-600">{invalidEmails.length}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{t.import.preview.csvDuplicates}</span>
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                    </div>
                    <div className="text-xl font-bold text-yellow-600">{csvDuplicates}</div>
                  </CardContent>
                </Card>
              </div>

              {invalidEmails.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">
                    {t.import.preview.invalidIgnored(invalidEmails.length)}
                  </AlertDescription>
                </Alert>
              )}

              {noEmailCount > 0 && (
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {t.import.preview.noEmailInfo(noEmailCount)}
                  </AlertDescription>
                </Alert>
              )}

              <Card className="flex-1 min-h-0 flex flex-col">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">{t.import.preview.title}</CardTitle>
                  <CardDescription className="text-xs">
                    {validContacts.length > 10
                      ? t.import.preview.firstN(validContacts.length)
                      : t.import.preview.nContacts(validContacts.length)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex-1 min-h-0 overflow-auto">
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-xs w-8">#</TableHead>
                          <TableHead className="text-xs">{t.import.preview.contact}</TableHead>
                          <TableHead className="text-xs">{t.import.preview.company}</TableHead>
                          <TableHead className="text-xs">{t.import.preview.status}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validContacts.slice(0, 10).map((contact, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">
                                {contact.first_name || '—'} {contact.last_name || ''}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {contact.email || <span className="italic">{t.import.preview.noEmail}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {contact.company_name ? (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  {contact.company_name}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">&mdash;</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <ContactStatusBadge status={contact.status || 'new'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {validContacts.length > 10 && (
                    <p className="text-xs text-muted-foreground mt-1.5 text-center">
                      {t.import.preview.moreContacts(validContacts.length - 10)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" size="sm" onClick={resetAll}>
                  {t.common.cancel}
                </Button>
                <Button size="sm" onClick={handleCheckDuplicates} disabled={checking}>
                  {checking ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      {t.common.loading}
                    </>
                  ) : (
                    t.import.preview.importButton(validContacts.length)
                  )}
                </Button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    {t.import.done.title}
                  </CardTitle>
                  <CardDescription>
                    {t.import.done.description(importedIds.length)}
                  </CardDescription>
                </CardHeader>
              </Card>

              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 pb-4 px-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-amber-500" />
                      <span className="text-sm font-medium">{t.import.done.scoring.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.import.done.scoring.description}</p>
                    {scoringRunning ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t.import.done.scoring.progress(scoringProgress, scoringTotal)}</span>
                          <span>{Math.round((scoringProgress / scoringTotal) * 100)}%</span>
                        </div>
                        <Progress value={(scoringProgress / scoringTotal) * 100} />
                      </div>
                    ) : scoringDone ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t.import.done.scoring.done}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => startScoring(importedIds)}
                      >
                        <Brain className="mr-1.5 h-3.5 w-3.5" />
                        {t.import.done.scoring.button}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-4 px-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">{t.import.done.personalize.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.import.done.personalize.description}</p>
                    {personalizingRunning ? (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{t.import.done.personalize.progress(personalizingProgress, personalizingTotal)}</span>
                          <span>{Math.round((personalizingProgress / personalizingTotal) * 100)}%</span>
                        </div>
                        <Progress value={(personalizingProgress / personalizingTotal) * 100} />
                      </div>
                    ) : personalizingDone ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t.import.done.personalize.done}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => startPersonalizing(importedIds)}
                      >
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                        {t.import.done.personalize.button}
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 pb-4 px-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">{t.import.done.enrich.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.import.done.enrich.description}</p>
                    {enrichingImported ? (
                      <Button variant="outline" size="sm" className="w-full" disabled>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {t.import.done.enrich.button}
                      </Button>
                    ) : enrichingDone ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t.import.done.enrich.started}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleEnrichImported(importedIds)}
                      >
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        {t.import.done.enrich.button}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => router.push('/contacts')}>
                  {t.import.done.viewContacts}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}

          {step === 'duplicates' && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t.import.duplicates.existsMessage(dbDuplicates.length, newCount)}
                  {dbDuplicates.some(d => d.owner_name) && (
                    <span className="block mt-1 text-orange-600 font-medium">
                      {t.import.duplicates.assignedWarning}
                    </span>
                  )}
                </AlertDescription>
              </Alert>

              <Card className="flex-1 min-h-0 flex flex-col">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">{t.import.duplicates.existingContacts(dbDuplicates.length)}</CardTitle>
                  <CardDescription className="text-xs">
                    {t.import.duplicates.willNotImport}
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3 flex-1 min-h-0 overflow-auto">
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="text-xs">{t.import.duplicates.headers.email}</TableHead>
                          <TableHead className="text-xs">{t.import.duplicates.headers.name}</TableHead>
                          <TableHead className="text-xs">{t.import.duplicates.headers.owner}</TableHead>
                          <TableHead className="text-xs">{t.import.duplicates.headers.addedBy}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dbDuplicates.map((dup, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <span className="text-xs">{dup.email}</span>
                            </TableCell>
                            <TableCell className="text-xs">
                              {dup.first_name || ''} {dup.last_name || ''}
                            </TableCell>
                            <TableCell>
                              {dup.owner_name ? (
                                <Badge variant="secondary" className="text-xs">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  {dup.owner_name}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">{t.common.unassigned}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
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
                  {t.common.cancel}
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
                        {t.common.loading}
                      </>
                    ) : (
                      t.import.duplicates.importButton(newCount)
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
