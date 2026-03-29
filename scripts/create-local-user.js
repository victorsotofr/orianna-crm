#!/usr/bin/env node

/**
 * Script pour créer un utilisateur local pour tester
 * Usage: node scripts/create-local-user.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement manquantes:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Service role client (bypass RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createUser() {
  const email = process.env.TEST_USER_EMAIL || 'test@local.dev';
  const password = process.env.TEST_USER_PASSWORD || 'ChangeMe!LocalDev1';
  const fullName = 'Test Local';

  console.log('\n🔐 Création d\'un compte test local...\n');
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Mot de passe: [set via TEST_USER_PASSWORD env var]`);
  console.log('');

  try {
    // 1. Créer l'utilisateur dans Supabase Auth
    console.log('1️⃣  Création de l\'utilisateur dans Supabase Auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm l'email
      user_metadata: {
        full_name: fullName,
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('⚠️  L\'utilisateur existe déjà !');
        console.log('');
        console.log('Tu peux te connecter avec:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${password}`);
        console.log('');

        // Récupérer l'utilisateur existant
        const { data: users } = await supabase.auth.admin.listUsers();
        const existingUser = users?.users?.find(u => u.email === email);

        if (existingUser) {
          console.log(`✅ User ID: ${existingUser.id}`);
          return existingUser;
        }
        return;
      }
      throw authError;
    }

    const userId = authData.user.id;
    console.log(`   ✅ Utilisateur créé avec ID: ${userId}`);

    // 2. Créer un workspace pour cet utilisateur
    console.log('2️⃣  Création d\'un workspace...');
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: 'Mon Workspace Test',
        slug: 'test-local',
        created_by: userId,
      })
      .select()
      .single();

    if (wsError) throw wsError;
    console.log(`   ✅ Workspace créé avec ID: ${workspace.id}`);

    // 3. Ajouter l'utilisateur comme membre du workspace
    console.log('3️⃣  Ajout au workspace...');
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        email: email,
        display_name: fullName,
        role: 'admin', // 'admin' ou 'member' seulement
      });

    if (memberError) throw memberError;
    console.log(`   ✅ Membre ajouté au workspace`);

    console.log('\n✅ Compte créé avec succès !\n');
    console.log('🎯 Tu peux maintenant te connecter sur http://localhost:3000/login');
    console.log('');
    console.log('Credentials:');
    console.log(`   📧 Email: ${email}`);
    console.log(`   🔑 Password: ${password}`);
    console.log('');

  } catch (error) {
    console.error('\n❌ Erreur lors de la création:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Erreur fatale:', err);
    process.exit(1);
  });
