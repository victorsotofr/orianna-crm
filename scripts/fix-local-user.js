#!/usr/bin/env node

/**
 * Script pour fixer le compte test local (ajouter au workspace)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixUser() {
  const email = 'test@local.dev';

  console.log('\n🔧 Correction du compte test local...\n');

  try {
    // Récupérer l'utilisateur
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users?.find(u => u.email === email);

    if (!user) {
      console.error('❌ Utilisateur non trouvé !');
      process.exit(1);
    }

    console.log(`✅ User trouvé: ${user.id}`);

    // Récupérer le workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('*')
      .eq('created_by', user.id)
      .single();

    if (!workspace) {
      console.error('❌ Workspace non trouvé !');
      process.exit(1);
    }

    console.log(`✅ Workspace trouvé: ${workspace.id}`);

    // Ajouter le membre avec le bon rôle
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        email: email,
        display_name: 'Test Local',
        role: 'admin',
      });

    if (memberError) {
      if (memberError.message.includes('duplicate')) {
        console.log('⚠️  Le membre existe déjà !');
      } else {
        throw memberError;
      }
    } else {
      console.log('✅ Membre ajouté au workspace !');
    }

    console.log('\n✅ Compte fixé avec succès !\n');
    console.log('🎯 Tu peux maintenant te connecter sur http://localhost:3000/login');
    console.log('');
    console.log('Credentials:');
    console.log(`   📧 Email: ${email}`);
    console.log(`   🔑 Password: [the password set during user creation]`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erreur fatale:', err);
    process.exit(1);
  });
