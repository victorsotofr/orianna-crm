import 'server-only';
import { generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import type { Contact } from '@/types/database';

interface PersonalizationResult {
  line: string;
}

function buildContext(contact: Contact): string {
  const parts: string[] = [];

  if (contact.first_name || contact.last_name) {
    parts.push(`Nom: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}`);
  }
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.company_name) parts.push(`Entreprise: ${contact.company_name}`);
  if (contact.company_domain) parts.push(`Site web: ${contact.company_domain}`);
  if (contact.job_title) parts.push(`Poste: ${contact.job_title}`);
  if (contact.linkedin_url) parts.push(`LinkedIn: ${contact.linkedin_url}`);
  if (contact.location) parts.push(`Ville: ${contact.location}`);
  if (contact.education) parts.push(`Formation: ${contact.education}`);

  return parts.join('\n');
}

/**
 * Cleans AI output by removing leaked reasoning, search narration, etc.
 * The AI sometimes leaks intermediate thoughts like "Laissez-moi chercher..."
 */
function cleanOutput(raw: string): string {
  // Take only the LAST paragraph/sentence block — reasoning is always before
  const blocks = raw.split(/\n\n+/);
  let candidate = blocks[blocks.length - 1].trim();

  // If multiple sentences separated by single newlines, take the last block
  const lines = candidate.split('\n');
  if (lines.length > 3) {
    candidate = lines.slice(-2).join(' ').trim();
  }

  // Remove common reasoning leak patterns (French)
  const leakPatterns = [
    /^(Je vais|Laissez-moi|Parfait|Maintenant|Voici|D'accord|Très bien|OK|Bien)[^.]*\.\s*/gi,
    /^(Let me|I'll|I need|I found|I can see|Looking at|Based on)[^.]*\.\s*/gi,
    /^(J'ai trouvé|Je constate|Je remarque|Je note|Je vois)[^.]*\.\s*/gi,
  ];

  let cleaned = candidate;
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of leakPatterns) {
      const before = cleaned;
      cleaned = cleaned.replace(pattern, '');
      if (cleaned !== before) changed = true;
    }
  }

  // Remove wrapping quotes
  cleaned = cleaned.replace(/^["«''"]|["»''"]$/g, '').trim();

  // If still too long (>300 chars), take only the last sentence
  if (cleaned.length > 300) {
    const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 1) {
      cleaned = sentences[sentences.length - 1].trim();
    }
  }

  return cleaned;
}

export async function personalizeContact(contact: Contact): Promise<PersonalizationResult> {
  const context = buildContext(contact);

  // --- PASS 1: Research the contact via web search ---
  const researchResult = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    stopWhen: stepCountIs(5),
    tools: {
      web_search: anthropic.tools.webSearch_20250305(),
    },
    system: `Tu es un assistant de recherche. Recherche des informations sur ce contact professionnel et son entreprise.
Trouve des éléments concrets et récents : actualités, projets, levées de fonds, recrutements, expansion, nominations.
Résume en 3-5 bullet points les faits les plus pertinents et récents que tu trouves.
Réponds UNIQUEMENT avec les bullet points, rien d'autre.`,
    prompt: context,
  });

  // Extract research from the last step only (avoid intermediate reasoning)
  const steps = researchResult.steps;
  const research = steps.length > 0
    ? steps[steps.length - 1].text.trim()
    : researchResult.text.trim();

  // --- PASS 2: Generate the personalized sentence (no tools = clean output) ---
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: `Tu es un copywriter expert en cold email B2B.

MISSION : Écrire UNE SEULE phrase de transition personnalisée (max 20 mots).

CONTEXTE D'INSERTION : Cette phrase sera insérée dans un email de prospection juste après :
"Nous cherchons des directeurs d'agences expérimentés pour développer l'outil avec nous et nous faire des retours terrains."

La phrase doit faire le PONT entre le paragraphe précédent et la proposition de call qui suit.

RÈGLES STRICTES :
- UNE seule phrase, maximum 20 mots
- Vouvoiement obligatoire
- Doit mentionner un fait CONCRET et VÉRIFIÉ sur le contact (pas d'invention)
- Doit créer un lien naturel avec le sujet de l'email (IA, immobilier, proptech, gestion d'agence)
- Ton : professionnel, naturel, pas flatteur ni forcé
- NE PAS commencer par "Je"
- NE PAS utiliser de formule générique ("J'ai vu votre profil", "Votre parcours impressionnant")
- NE PAS expliquer ton raisonnement
- NE PAS mettre de guillemets

EXEMPLES DE BON RÉSULTAT :
- "Votre expertise chez [Entreprise] dans la gestion de [X] agences serait particulièrement précieuse."
- "Avec [X] ans d'expérience en transaction à [Ville], votre retour nous serait très utile."
- "La croissance récente de [Entreprise] sur [Ville] montre une dynamique qui colle parfaitement à notre approche."

RÉPONDS UNIQUEMENT AVEC LA PHRASE. RIEN D'AUTRE.`,
    prompt: `CONTACT :\n${context}\n\nRECHERCHE :\n${research}\n\nÉcris la phrase :`,
  });

  const line = cleanOutput(result.text);

  return { line };
}
