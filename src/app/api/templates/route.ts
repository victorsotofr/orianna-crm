import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    // For GET templates, we can allow public access or require auth
    // If you want to require auth, uncomment below:
    // if (clientError || !supabase) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Use public client if auth fails (for public templates)
    const client = supabase || (await import('@/lib/supabase')).supabase;

    const { searchParams } = new URL(request.url);
    const industry = searchParams.get('industry');

    let query = client
      .from('templates')
      .select('*')
      .order('industry', { ascending: true });

    if (industry && industry !== 'all') {
      query = query.eq('industry', industry);
    }

    const { data: templates, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error('Templates fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, subject, industry, html_content } = body;

    // Validation
    if (!name || !subject || !industry || !html_content) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Validate industry is not "other" (should be a resolved custom industry name)
    if (industry === 'other') {
      return NextResponse.json(
        { error: 'Veuillez sélectionner ou créer une industrie spécifique' },
        { status: 400 }
      );
    }

    const { data: template, error } = await supabase
      .from('templates')
      .insert({
        name,
        subject,
        industry,
        html_content,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    console.error('Template creation error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to create template' },
      { status: 500 }
    );
  }
}

