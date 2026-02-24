/**
 * Seed script for creating team members
 * Usage: npx tsx scripts/seed-users.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEAM = [
  { email: 'victor.soto@polytechnique.edu', displayName: 'Victor Soto', role: 'admin' },
  { email: 'adrien.senghor@polytechnique.edu', displayName: 'Adrien Senghor', role: 'member' },
  { email: 'valentin.henry-leo@polytechnique.edu', displayName: 'Valentin Henry-Léo', role: 'member' },
];

function generatePassword(length = 16): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

async function seedUsers() {
  console.log('🌱 Seeding team members...\n');

  const credentials: { email: string; password: string }[] = [];

  for (const member of TEAM) {
    const password = generatePassword();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: member.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: member.displayName },
    });

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('already been registered')) {
        console.log(`⚠️  User ${member.email} already exists, skipping auth creation`);

        // Get existing user
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users?.find(u => u.email === member.email);

        if (existingUser) {
          // Upsert team_members row
          await supabase.from('team_members').upsert({
            user_id: existingUser.id,
            email: member.email,
            display_name: member.displayName,
            role: member.role,
          }, { onConflict: 'user_id' });

          // Upsert user_settings with defaults
          await supabase.from('user_settings').upsert({
            user_id: existingUser.id,
            user_email: member.email,
            smtp_host: 'webmail.polytechnique.fr',
            smtp_port: 587,
            imap_host: 'webmail.polytechnique.fr',
            imap_port: 993,
            daily_send_limit: 50,
          }, { onConflict: 'user_id' });

          console.log(`✅ Updated team_members + user_settings for ${member.email}`);
        }
        continue;
      }
      console.error(`❌ Failed to create ${member.email}:`, authError.message);
      continue;
    }

    const userId = authData.user!.id;
    credentials.push({ email: member.email, password });

    // Insert team_members row
    const { error: teamError } = await supabase.from('team_members').upsert({
      user_id: userId,
      email: member.email,
      display_name: member.displayName,
      role: member.role,
    }, { onConflict: 'user_id' });

    if (teamError) {
      console.error(`❌ team_members insert failed for ${member.email}:`, teamError.message);
    }

    // Insert default user_settings
    const { error: settingsError } = await supabase.from('user_settings').upsert({
      user_id: userId,
      user_email: member.email,
      smtp_host: 'webmail.polytechnique.fr',
      smtp_port: 587,
      imap_host: 'webmail.polytechnique.fr',
      imap_port: 993,
      daily_send_limit: 50,
    }, { onConflict: 'user_id' });

    if (settingsError) {
      console.error(`❌ user_settings insert failed for ${member.email}:`, settingsError.message);
    }

    console.log(`✅ Created user: ${member.email} (${member.role})`);
  }

  // Output credentials
  if (credentials.length > 0) {
    console.log('\n📋 NEW CREDENTIALS (save these!):\n');
    console.log('| Email | Password |');
    console.log('|-------|----------|');
    for (const cred of credentials) {
      console.log(`| ${cred.email} | ${cred.password} |`);
    }

    // Write CREDENTIALS.md
    const credContent = `# Team Credentials\n\n> Generated on ${new Date().toISOString()}\n> **DELETE THIS FILE** after distributing passwords.\n\n| Email | Password |\n|-------|----------|\n${credentials.map(c => `| ${c.email} | \`${c.password}\` |`).join('\n')}\n`;

    const credPath = path.join(__dirname, '..', 'CREDENTIALS.md');
    fs.writeFileSync(credPath, credContent);
    console.log(`\n📄 Credentials written to ${credPath}`);
  }

  console.log('\n✅ Seeding complete!');
}

seedUsers().catch(console.error);
