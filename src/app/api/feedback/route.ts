import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { Octokit } from '@octokit/rest';

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

    const { type, title, description, imageUrl } = await request.json();

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json({ error: 'Title and description are required' }, { status: 400 });
    }

    const pat = process.env.GITHUB_FEEDBACK_PAT;
    if (!pat) {
      return NextResponse.json({ error: 'Feedback service not configured' }, { status: 500 });
    }

    const octokit = new Octokit({ auth: pat });

    // Build issue body
    const lines = [
      `**Type:** ${type === 'bug' ? 'Bug' : 'Amelioration'}`,
      '',
      `**Reporter:** ${user.email || user.id}`,
      '',
      '## Description',
      '',
      description,
    ];

    if (imageUrl) {
      lines.push('', '## Screenshot', '', `![Screenshot](${imageUrl})`);
    }

    const label = type === 'bug' ? 'bug' : 'enhancement';

    await octokit.issues.create({
      owner: 'victorsotofr',
      repo: 'orianna-crm',
      title: `[${label === 'bug' ? 'Bug' : 'Feature'}] ${title}`,
      body: lines.join('\n'),
      labels: [label],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Feedback error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}
