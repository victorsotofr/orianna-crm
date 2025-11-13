import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

// GET - Fetch all industries (predefined + custom)
export async function GET(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch industries: global (user_id IS NULL) + user's custom industries
    const { data: industries, error } = await supabase
      .from('custom_industries')
      .select('*')
      .eq('is_active', true)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('Industries fetch error:', error);
      throw error;
    }

    return NextResponse.json({ 
      industries: industries || [],
      // Also return predefined options for backward compatibility
      predefined: [
        { name: 'real_estate', display_name: 'Immobilier' },
        { name: 'notary', display_name: 'Notaire' },
        { name: 'hotel', display_name: 'Hôtellerie' },
      ]
    });
  } catch (error: any) {
    console.error('Industries API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch industries' },
      { status: 500 }
    );
  }
}

// POST - Create a new custom industry
export async function POST(request: Request) {
  try {
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { displayName } = body;

    if (!displayName || displayName.trim() === '') {
      return NextResponse.json(
        { error: 'Le nom de l\'industrie est requis' },
        { status: 400 }
      );
    }

    // Validate length
    if (displayName.length < 2 || displayName.length > 50) {
      return NextResponse.json(
        { error: 'Le nom doit contenir entre 2 et 50 caractères' },
        { status: 400 }
      );
    }

    // Generate a slug from display name (lowercase, replace spaces with underscores)
    const name = displayName
      .toLowerCase()
      .trim()
      .normalize('NFD') // Normalize to decomposed form
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 100); // Limit length

    console.log('🏭 Creating custom industry:', { name, displayName, user_id: user.id });

    // Check if industry already exists (case-insensitive)
    const { data: existing } = await supabase
      .from('custom_industries')
      .select('id, name, display_name')
      .ilike('name', name)
      .maybeSingle();

    if (existing) {
      console.log('⚠️ Industry already exists:', existing);
      return NextResponse.json({ 
        industry: existing,
        message: 'Cette industrie existe déjà',
        alreadyExists: true
      });
    }

    // Create the industry
    const { data: industry, error } = await supabase
      .from('custom_industries')
      .insert({
        name,
        display_name: displayName.trim(),
        user_id: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Industry creation error:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Cette industrie existe déjà' },
          { status: 409 }
        );
      }
      
      throw error;
    }

    console.log('✅ Custom industry created:', industry);

    return NextResponse.json({ 
      industry,
      message: 'Industrie créée avec succès'
    }, { status: 201 });
  } catch (error: any) {
    console.error('❌ Create industry error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create industry' },
      { status: 500 }
    );
  }
}

