'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Mail, Building2, User } from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { IndustrySelector } from '@/components/industry-selector';

interface ParsedContact {
  email: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  company_name?: string;
  companyName?: string;
  [key: string]: any;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [validContacts, setValidContacts] = useState<ParsedContact[]>([]);
  const [invalidEmails, setInvalidEmails] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<number>(0);
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Veuillez sélectionner un fichier CSV');
      return;
    }

    setFile(selectedFile);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as ParsedContact[];
        
        // Validate and filter contacts
        const valid: ParsedContact[] = [];
        const invalid: string[] = [];
        const seen = new Set<string>();
        let dupeCount = 0;

        data.forEach((contact) => {
          const email = contact.email?.toLowerCase().trim();
          
          if (!email) {
            invalid.push('(empty email)');
            return;
          }

          if (!validateEmail(email)) {
            invalid.push(email);
            return;
          }

          if (seen.has(email)) {
            dupeCount++;
            return;
          }

          seen.add(email);
          valid.push({
            ...contact,
            email,
            first_name: contact.first_name || contact.firstName,
            last_name: contact.last_name || contact.lastName,
            company_name: contact.company_name || contact.companyName,
          });
        });

        setParsedContacts(data);
        setValidContacts(valid);
        setInvalidEmails(invalid);
        setDuplicates(dupeCount);
        setStep('preview');
        
        toast.success(`${valid.length} contacts valides trouvés`);
      },
      error: (error) => {
        toast.error(`Erreur lors de la lecture du fichier: ${error.message}`);
      },
    });
  };

  const handleImport = async () => {
    if (validContacts.length === 0) {
      toast.error('Aucun contact valide à importer');
      return;
    }

    if (!selectedIndustry) {
      toast.error('Veuillez sélectionner une industrie');
      return;
    }

    setUploading(true);
    try {
      const response = await fetch('/api/contacts/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: validContacts,
          industry: selectedIndustry,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`${data.imported} contacts importés avec succès!`);
        router.push('/campaigns/new');
      } else {
        toast.error(data.error || 'Erreur lors de l\'importation');
      }
    } catch (error) {
      toast.error('Erreur lors de l\'importation des contacts');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      // Simulate file input change
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

  return (
    <>
      <SiteHeader title="Import CSV" />
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

      {step === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Télécharger un fichier CSV</CardTitle>
            <CardDescription>
              Le fichier doit contenir au minimum les colonnes: <strong>email</strong>, <strong>firstName</strong> (ou first_name)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Glissez-déposez votre fichier CSV ici
              </p>
              <p className="text-sm text-gray-500 mb-4">ou cliquez pour sélectionner</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button type="button" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Sélectionner un fichier
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'preview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Contacts valides</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{validContacts.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Emails invalides</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{invalidEmails.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">Doublons</CardTitle>
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{duplicates}</div>
              </CardContent>
            </Card>
          </div>

          {invalidEmails.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {invalidEmails.length} email(s) invalide(s) ont été ignorés
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Sélectionner l&apos;industrie</CardTitle>
              <CardDescription>
                Cette information sera utilisée pour classifier vos contacts et choisir le template approprié
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="industry-select">Industrie des contacts</Label>
                <IndustrySelector
                  value={selectedIndustry}
                  onValueChange={setSelectedIndustry}
                  placeholder="Choisissez une industrie..."
                  className="w-full md:w-[400px]"
                />
                <p className="text-xs text-muted-foreground">
                  Vous pouvez créer une nouvelle industrie si elle n&apos;existe pas dans la liste
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Aperçu des contacts</CardTitle>
              <CardDescription>
                {validContacts.length > 10 
                  ? `Affichage des 10 premiers contacts sur ${validContacts.length} au total`
                  : `${validContacts.length} contact(s) à importer`
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted">
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Entreprise</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validContacts.slice(0, 10).map((contact, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {contact.first_name || '(Prénom manquant)'} {contact.last_name || '(Nom manquant)'}
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {contact.company_name ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span>{contact.company_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {validContacts.length > 10 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  ... et {validContacts.length - 10} contact(s) supplémentaire(s)
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                setStep('upload');
                setFile(null);
                setParsedContacts([]);
                setValidContacts([]);
                setInvalidEmails([]);
                setDuplicates(0);
              }}
            >
              Annuler
            </Button>
            <Button onClick={handleImport} disabled={uploading} size="lg">
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importation...
                </>
              ) : (
                `Importer ${validContacts.length} contact${validContacts.length > 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </>
      )}
        </div>
      </div>
    </>
  );
}

