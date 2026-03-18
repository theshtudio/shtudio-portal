import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: clientId } = await params;

  const body = await request.json();
  const {
    name,
    website,
    industry,
    primary_contact_name,
    primary_contact_email,
    primary_contact_phone,
  } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
  }

  const adminSupabase = createServiceSupabase();

  const { data: updated, error: updateError } = await adminSupabase
    .from('clients')
    .update({
      name: name.trim(),
      website: website?.trim() || null,
      industry: industry?.trim() || null,
      primary_contact_name: primary_contact_name?.trim() || null,
      primary_contact_email: primary_contact_email?.trim() || null,
      primary_contact_phone: primary_contact_phone?.trim() || null,
    })
    .eq('id', clientId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ client: updated });
}
