import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: reportId } = await params;
  const supabase = createServiceSupabase();

  const { data: comments, error } = await supabase
    .from('report_comments')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch author names separately since the join may not work without a FK
  const userIds = [...new Set((comments || []).map((c) => c.user_id).filter(Boolean))];
  let profileMap: Record<string, { full_name: string | null; email: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, { full_name: p.full_name, email: p.email }]),
      );
    }
  }

  const enrichedComments = (comments || []).map((c) => ({
    ...c,
    profiles: profileMap[c.user_id] || null,
  }));

  return NextResponse.json({ comments: enrichedComments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Admin auth check
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: reportId } = await params;
  const { comment } = await request.json();

  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    return NextResponse.json({ error: 'Comment text is required' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: newComment, error } = await adminSupabase
    .from('report_comments')
    .insert({
      report_id: reportId,
      user_id: user.id,
      comment: comment.trim(),
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enrichedComment = {
    ...newComment,
    profiles: { full_name: profile.full_name ?? null, email: profile.email ?? null },
  };

  return NextResponse.json({ comment: enrichedComment }, { status: 201 });
}
