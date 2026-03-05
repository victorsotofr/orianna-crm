-- Script pour mettre à jour le statut des contacts de Valentin Henry-Léo
-- Change tous les contacts avec status='contacted' vers status='new'
-- Ne touche PAS aux contacts avec d'autres statuts (engaged, qualified, etc.)

-- Étape 1 : Vérifier les contacts qui vont être modifiés
-- Décommente cette requête pour voir ce qui va changer avant d'exécuter la mise à jour
/*
SELECT
  c.id,
  c.first_name,
  c.last_name,
  c.company_name,
  c.email,
  c.status,
  wm.display_name as assigned_to_name
FROM contacts c
JOIN workspace_members wm ON c.assigned_to = wm.user_id
WHERE wm.display_name = 'Valentin Henry-Léo'
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
  WHERE display_name = 'Valentin Henry-Léo'
)
AND status = 'contacted';

-- Afficher le nombre de lignes modifiées
-- (Supabase affichera automatiquement "UPDATE X" où X est le nombre de lignes)
