-- Script alternatif si tu connais l'email de Valentin plutôt que le display_name
-- Change tous les contacts avec status='contacted' vers status='new'

-- Remplace 'valentin@example.com' par l'email réel de Valentin
-- Étape 1 : Vérifier les contacts qui vont être modifiés
/*
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.company_name,
  c.email,
  c.status,
  wm.display_name as assigned_to_name,
  wm.email as owner_email
FROM contacts c
JOIN workspace_members wm ON c.assigned_to = wm.user_id
WHERE wm.email = 'valentin@example.com'
  AND c.status = 'contacted';
*/

-- Étape 2 : Exécuter la mise à jour
UPDATE contacts
SET
  status = 'new',
  updated_at = now()
WHERE assigned_to IN (
  SELECT user_id
  FROM workspace_members
  WHERE email = 'valentin@example.com'  -- Remplace par l'email réel
)
AND status = 'contacted';
