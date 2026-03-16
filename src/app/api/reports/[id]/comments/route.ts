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
    .select('*, profiles(full_name, email)')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comments: comments || [] });
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
    .select('role')
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
    .select('*, profiles(full_name, email)')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ comment: newComment }, { status: 201 });
}
