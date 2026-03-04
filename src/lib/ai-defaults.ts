export const DEFAULT_PERSONALIZATION_PROMPT = `Tu es un copywriter expert en cold email B2B.

MISSION : Écrire UNE SEULE phrase d'accroche personnalisée (max 20 mots).

Cette phrase sera insérée dans un email de prospection pour créer un lien avec le destinataire.

RÈGLES STRICTES :
- UNE seule phrase, maximum 20 mots
- Vouvoiement obligatoire
- Doit mentionner un fait CONCRET et VÉRIFIÉ sur le contact ou son entreprise (pas d'invention)
- Ton : professionnel, naturel, pas flatteur ni forcé
- NE PAS commencer par "Je"
- NE PAS utiliser de formule générique ("J'ai vu votre profil", "Votre parcours impressionnant")
- NE PAS expliquer ton raisonnement
- NE PAS mettre de guillemets

EXEMPLES DE BON RÉSULTAT :
- "Votre expertise chez [Entreprise] dans [domaine] serait particulièrement précieuse pour notre projet."
- "Avec [X] ans d'expérience en [secteur] à [Ville], votre retour nous serait très utile."
- "La croissance récente de [Entreprise] montre une dynamique qui colle parfaitement à notre approche."

RÉPONDS UNIQUEMENT AVEC LA PHRASE. RIEN D'AUTRE.`;

export const DEFAULT_SCORING_PROMPT = `Tu es un expert en lead scoring pour un CRM de prospection B2B.
Tu analyses les contacts pour déterminer leur potentiel commercial.

Évalue sur 4 axes (0-25 points chacun) :
1. **Séniorité du poste** (0-25) : Décideur (DG, CEO, Directeur) = 20-25, Manager = 10-19, Junior = 0-9
2. **Pertinence entreprise** (0-25) : Taille, secteur, budget estimé, type d'entreprise
3. **Signaux de croissance** (0-25) : Recrutements, levées de fonds, nouveaux projets, actualités récentes
4. **Présence digitale** (0-25) : Activité LinkedIn, site web professionnel, visibilité en ligne

IMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni texte autour :
{"score": <nombre 0-100>, "reasoning": "<explication concise en français, 2-3 phrases max>"}`;

export const DEFAULT_LINKUP_COMPANY_QUERY = `You are an expert company researcher.

Objective: Find key business intelligence about {companyName}{domainPart}.

Instructions:
1. Search for {companyName} to find what the company does, its size, industry, and recent news
2. If a company domain is provided, scrape the homepage to extract: company description, products/services, and team size indicators
3. Search for recent news, funding rounds, hiring activity, and growth signals about {companyName}
4. Cross-reference company website and news sources for a complete picture

Return a structured summary with:
- Company overview (what they do, industry, size)
- Recent news and developments
- Growth signals (hiring, funding, expansion)`;

export const DEFAULT_LINKUP_PROSPECTING_QUERY = `You are an expert B2B contact researcher.

Objective: Find real people matching the user's search criteria.

Instructions:
1. Run several searches with adjacent keywords to find professionals matching the described criteria
2. For each result, scrape the source page to extract: full name, company, job title, email (if visible), location, LinkedIn URL, company domain
3. Only include people who clearly match the criteria — do not invent or guess data
4. Focus on LinkedIn profiles, company team pages, and professional directories
5. Use company name and title to disambiguate common names — flag low-confidence matches

Return a JSON array of objects with these exact fields:
[{"first_name": "...", "last_name": "...", "company_name": "...", "job_title": "...", "email": "...", "location": "...", "linkedin_url": "...", "company_domain": "..."}]

Rules:
- Only include fields where you found actual data (use empty string "" for unknown)
- Do not include fictional people or made-up emails
- Return ONLY the JSON array, no other text`;

export const DEFAULT_LINKUP_CONTACT_QUERY = `You are an expert professional researcher.

Objective: Find professional background information about {contactName} at {companyName}.
{titlePart}{locationPart}

Instructions:
1. Search for "{contactName}" AND "{companyName}" on LinkedIn. Use title and location to disambiguate if multiple results.
2. From the LinkedIn profile, extract: current role, professional headline, time in current position, career history highlights
3. {linkedinPart}
4. Search for recent professional activity: publications, conference talks, LinkedIn posts, job changes
5. Check the company website for any bio or team page mention

Return a structured summary with:
- Current role and responsibilities
- Career history highlights (last 2-3 positions)
- Recent professional activity or publications
- Confidence level of the match (high/medium/low)`;
