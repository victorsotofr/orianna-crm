#!/usr/bin/env python3
"""
Import past campaign from CSV with fictional date.
Usage: python scripts/import_past_campaign.py
"""

import pandas as pd
import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime

# Get the project root directory (email-automation folder)
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Load environment variables from project root
env_path = PROJECT_ROOT / '.env.local'
load_dotenv(env_path)

# Configuration
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')  # Use service role for admin access
CSV_PATH = PROJECT_ROOT / 'Notaires.csv'

# Campaign details
FICTIONAL_DATE = '2025-11-28T10:00:00Z'
VALENTIN_EMAIL = 'valentin.henry-leo@polytechnique.edu'
CAMPAIGN_NAME = 'Campagne Notaires - Novembre 2025'
INDUSTRY = 'notaires'

def main():
    """Main import function"""
    
    # Validate environment variables
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")
        print("   Please check your .env.local file")
        return
    
    # Initialize Supabase client
    print("🔌 Connecting to Supabase...")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    try:
        # 1. Get Valentin's user ID from user_settings table
        print(f"👤 Looking up user: {VALENTIN_EMAIL}")
        user_settings_response = supabase.table('user_settings').select('user_id, user_email').eq('user_email', VALENTIN_EMAIL).limit(1).execute()
        
        if not user_settings_response.data or len(user_settings_response.data) == 0:
            print(f"❌ Error: User {VALENTIN_EMAIL} not found")
            print("   The user_settings record doesn't exist for this email.")
            print("   Please create this account first via signup page:")
            print("   1. Go to: http://localhost:3000/signup")
            print(f"   2. Sign up with: {VALENTIN_EMAIL}")
            print("   3. Complete the signup process")
            print("   4. Then re-run this import script")
            return
        
        valentin_id = user_settings_response.data[0]['user_id']
        print(f"✅ Found user: {valentin_id}")
        
        # 2. Get notary template ID
        print(f"📋 Looking up template for industry: {INDUSTRY}")
        try:
            template_response = supabase.table('templates').select('id, name, industry').eq('industry', INDUSTRY).limit(1).execute()
            
            if not template_response.data or len(template_response.data) == 0:
                # Try to list all templates to help debug
                print(f"   No template found for industry '{INDUSTRY}'")
                print("   Checking available templates...")
                all_templates = supabase.table('templates').select('id, name, industry').execute()
                if all_templates.data:
                    print("   Available templates:")
                    for tmpl in all_templates.data:
                        print(f"     - {tmpl.get('name', 'N/A')} (industry: '{tmpl.get('industry', 'N/A')}')")
                else:
                    print("   No templates found in database at all")
                print(f"❌ Error: No template found for industry '{INDUSTRY}'")
                print("   Please ensure templates are seeded in database")
                return
            
            template_id = template_response.data[0]['id']
            template_name = template_response.data[0].get('name', 'Unknown')
            print(f"✅ Found template: {template_id} ({template_name})")
        except Exception as e:
            print(f"❌ Error querying templates: {e}")
            import traceback
            traceback.print_exc()
            return
        
        # 3. Read CSV
        print(f"📄 Reading CSV: {CSV_PATH}")
        if not CSV_PATH.exists():
            print(f"❌ Error: CSV file not found at {CSV_PATH}")
            print("   Please ensure Notaires.csv is in the email-automation directory")
            return
        
        df = pd.read_csv(str(CSV_PATH))
        total_rows = len(df)
        print(f"✅ Loaded {total_rows} contacts from CSV")
        
        # 4. Create campaign
        print(f"📊 Creating campaign: {CAMPAIGN_NAME}")
        campaign_response = supabase.table('campaigns').insert({
            'name': CAMPAIGN_NAME,
            'industry': INDUSTRY,
            'template_id': template_id,
            'created_by': valentin_id,
            'created_by_email': VALENTIN_EMAIL,
            'status': 'completed',
            'total_contacts': total_rows,
            'sent_count': 0,  # Will update after import
            'failed_count': 0,
            'created_at': FICTIONAL_DATE
        }).execute()
        
        campaign_id = campaign_response.data[0]['id']
        print(f"✅ Campaign created: {campaign_id}")
        
        # 5. Import contacts and mark as sent
        print(f"\n📥 Importing {total_rows} contacts...")
        imported = 0
        skipped = 0
        errors = 0
        
        for index, row in df.iterrows():
            try:
                # Get email and handle NaN values
                email_value = row.get('email', '')
                if pd.isna(email_value) or not email_value:
                    print(f"⏭️  Row {index+1}: Missing email, skipping")
                    skipped += 1
                    continue
                
                email = str(email_value).strip()
                
                if not email or '@' not in email:
                    print(f"⏭️  Row {index+1}: Invalid email '{email}', skipping")
                    skipped += 1
                    continue
                
                # Helper function to safely get string value
                def get_str(field_name):
                    val = row.get(field_name, '')
                    if pd.isna(val) or val == '':
                        return ''
                    return str(val).strip()
                
                # Convert row to dict and replace NaN/inf with None for JSON compliance
                raw_dict = row.to_dict()
                raw_dict_clean = {}
                for k, v in raw_dict.items():
                    if pd.isna(v):
                        raw_dict_clean[k] = None
                    elif isinstance(v, float) and (v == float('inf') or v == float('-inf')):
                        raw_dict_clean[k] = None
                    else:
                        raw_dict_clean[k] = v
                
                # Prepare contact data
                contact_data = {
                    'email': email,
                    'first_name': get_str('firstName'),
                    'last_name': get_str('lastName'),
                    'company_name': get_str('companyName'),
                    'job_title': get_str('jobTitle'),
                    'linkedin_url': get_str('linkedinUrl'),
                    'industry': INDUSTRY,
                    'created_by': valentin_id,
                    'created_by_email': VALENTIN_EMAIL,
                    'created_at': FICTIONAL_DATE,
                    'raw_data': raw_dict_clean  # Store all CSV data as JSON (NaN replaced with None)
                }
                
                # Insert or update contact (upsert by email)
                contact_response = supabase.table('contacts').upsert(
                    contact_data,
                    on_conflict='email'
                ).execute()
                
                contact_id = contact_response.data[0]['id']
                
                # Check if already sent (global deduplication)
                existing_response = supabase.table('emails_sent').select('id').eq('contact_id', contact_id).eq('template_id', template_id).execute()
                
                if existing_response.data:
                    print(f"⏭️  Row {index+1}: {email} - Already sent, skipping")
                    skipped += 1
                    continue
                
                # Insert email_sent record
                supabase.table('emails_sent').insert({
                    'contact_id': contact_id,
                    'campaign_id': campaign_id,
                    'template_id': template_id,
                    'sent_by': valentin_id,
                    'sent_by_email': VALENTIN_EMAIL,
                    'sent_at': FICTIONAL_DATE,
                    'status': 'sent',
                    'follow_up_stage': 0
                }).execute()
                
                imported += 1
                
                if (index + 1) % 10 == 0:
                    print(f"   Progress: {index + 1}/{total_rows} ({imported} imported, {skipped} skipped)")
                
            except Exception as e:
                errors += 1
                print(f"❌ Row {index+1}: Error - {e}")
        
        # 6. Update campaign stats
        print(f"\n📊 Updating campaign statistics...")
        supabase.table('campaigns').update({
            'sent_count': imported,
            'total_contacts': imported + skipped
        }).eq('id', campaign_id).execute()
        
        # 7. Summary
        print(f"\n{'='*50}")
        print(f"✅ IMPORT COMPLETE")
        print(f"{'='*50}")
        print(f"Campaign ID: {campaign_id}")
        print(f"Campaign Name: {CAMPAIGN_NAME}")
        print(f"Fictional Date: {FICTIONAL_DATE}")
        print(f"")
        print(f"📊 Results:")
        print(f"   ✅ Imported: {imported}")
        print(f"   ⏭️  Skipped: {skipped}")
        print(f"   ❌ Errors: {errors}")
        print(f"   📧 Total: {total_rows}")
        print(f"")
        print(f"🎉 Campaign successfully imported as Valentin!")
        
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()

