import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

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

    console.log('🔄 Updating template:', id);

    // First, check if template exists and is active
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // Use maybeSingle to avoid error if not found

    console.log('🔍 Existing template check:', { existingTemplate, checkError });

    if (checkError) {
      console.error('❌ Check error:', checkError);
      return NextResponse.json(
        { error: 'Erreur lors de la vérification du template' },
        { status: 500 }
      );
    }

    if (!existingTemplate) {
      console.error('❌ Template not found:', id);
      return NextResponse.json(
        { error: 'Template non trouvé' },
        { status: 404 }
      );
    }

    if (!existingTemplate.is_active) {
      console.error('❌ Template is inactive:', id);
      return NextResponse.json(
        { error: 'Ce template a été supprimé et ne peut pas être modifié' },
        { status: 410 } // 410 Gone
      );
    }

    // Update the template - simplified (only check id since we verified is_active above)
    console.log('📝 Attempting update with data:', { name, subject, industry });
    
    const { data: template, error } = await supabase
      .from('templates')
      .update({
        name,
        subject,
        industry,
        html_content,
      })
      .eq('id', id)
      .select()
      .maybeSingle(); // Use maybeSingle instead of single

    console.log('🔍 Update result:', { template, error });

    if (error) {
      console.error('❌ Update error:', error);
      throw error;
    }

    if (!template) {
      console.error('❌ No template returned after update - possible RLS issue');
      return NextResponse.json(
        { error: 'Impossible de mettre à jour le template. Vérifiez les permissions.' },
        { status: 500 }
      );
    }

    console.log('✅ Template updated successfully:', template.id);

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error('❌ Template update error:', error);
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

    console.log('🗑️ Soft deleting template:', id);

    // Check if template exists
    const { data: existingTemplate, error: checkError } = await supabase
      .from('templates')
      .select('id, is_active')
      .eq('id', id)
      .single();

    if (checkError || !existingTemplate) {
      console.error('❌ Template not found:', id);
      return NextResponse.json(
        { error: 'Template non trouvé' },
        { status: 404 }
      );
    }

    if (!existingTemplate.is_active) {
      console.warn('⚠️ Template already deleted:', id);
      return NextResponse.json({ 
        success: true,
        message: 'Template déjà supprimé' 
      });
    }

    // Soft delete - mark as inactive instead of deleting
    const { error } = await supabase
      .from('templates')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('❌ Deletion error:', error);
      throw error;
    }

    console.log('✅ Template soft deleted:', id);

    return NextResponse.json({ 
      success: true,
      message: 'Template supprimé avec succès' 
    });
  } catch (error: any) {
    console.error('❌ Template deletion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete template' },
      { status: 500 }
    );
  }
}

