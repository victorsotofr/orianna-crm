import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { getWorkspaceContext } from '@/lib/workspace';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params for Next.js 15
    const { id } = await params;
    
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
    const { name, subject, html_content } = body;

    // Validation
    if (!name || !subject || !html_content) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // First, check if template exists and is active
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // Use maybeSingle to avoid error if not found

    if (checkError) {
      return NextResponse.json(
        { error: 'Erreur lors de la vérification du template' },
        { status: 500 }
      );
    }

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Template non trouvé' },
        { status: 404 }
      );
    }

    // Update the template
    const { data: template, error } = await supabase
      .from('templates')
      .update({
        name,
        subject,
        html_content,
      })
      .eq('id', id)
      .select()
      .maybeSingle(); // Use maybeSingle instead of single

    if (error) {
      throw error;
    }

    if (!template) {
      return NextResponse.json(
        { error: 'Impossible de mettre à jour le template. Vérifiez les permissions.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('Template update error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to update template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Await params for Next.js 15
    const { id } = await params;
    
    // Get authenticated Supabase client
    const { supabase, error: clientError } = await createServerClient();

    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if template exists
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError || !existingTemplate) {
      return NextResponse.json(
        { error: 'Template non trouvé' },
        { status: 404 }
      );
    }

    // Hard delete the template
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Template supprimé avec succès'
    });
  } catch (error: any) {
    console.error('Template deletion error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete template' },
      { status: 500 }
    );
  }
}

