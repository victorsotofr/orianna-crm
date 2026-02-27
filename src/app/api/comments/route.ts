import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    const { supabase, error: clientError } = await createServerClient();
    if (clientError || !supabase) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id');

    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { data: comments, error } = await supabase
      .from('comments')
      .select(`
        *,
        team_members!comments_created_by_fkey (
          display_name,
          email
        )
      `)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback without join
      const { data: basicComments, error: basicError } = await supabase
        .from('comments')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (basicError) throw basicError;
      return NextResponse.json({ comments: basicComments || [] });
    }

    return NextResponse.json({ comments: comments || [] });
  } catch (error: any) {
    console.error('Comments fetch error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to fetch comments' }, { status: 500 });
  }
}

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
    const { contact_id, content } = body;

    if (!contact_id || !content?.trim()) {
      return NextResponse.json({ error: 'contact_id and content are required' }, { status: 400 });
    }

    const { data: comment, error } = await supabase
      .from('comments')
      .insert({
        contact_id,
        content: content.trim(),
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // Add timeline entry
    await supabase.from('contact_timeline').insert({
      contact_id,
      event_type: 'comment',
      title: 'Commentaire ajouté',
      description: content.trim().substring(0, 200),
      created_by: user.id,
    });

    return NextResponse.json({ comment });
  } catch (error: any) {
    console.error('Comment create error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error.message || 'Failed to create comment' }, { status: 500 });
  }
}
