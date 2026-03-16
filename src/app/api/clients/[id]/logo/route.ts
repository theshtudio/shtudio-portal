import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/** Extract the storage path from a Supabase public URL */
function extractStoragePath(publicUrl: string): string | null {
  const marker = '/storage/v1/object/public/client-logos/';
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return publicUrl.substring(idx + marker.length);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── Auth: must be logged-in admin ──
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

  // ── Parse & validate file ──
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: PNG, JPG, WebP, SVG.' },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 2 MB.' },
      { status: 400 },
    );
  }

  // ── Sanitize filename & build storage path ──
  const safeName = file.name
    .replace(/'/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  const filePath = `${clientId}/${Date.now()}-${safeName}`;

  const adminSupabase = createServiceSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());

  // ── Remove previous logo file (if any) ──
  const { data: client } = await adminSupabase
    .from('clients')
    .select('logo_url')
    .eq('id', clientId)
    .single();

  if (client?.logo_url) {
    const oldPath = extractStoragePath(client.logo_url);
    if (oldPath) {
      await adminSupabase.storage.from('client-logos').remove([oldPath]);
    }
  }

  // ── Upload to client-logos bucket ──
  const { error: uploadError } = await adminSupabase.storage
    .from('client-logos')
    .upload(filePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // ── Get public URL & update client record ──
  const { data: publicUrlData } = adminSupabase.storage
    .from('client-logos')
    .getPublicUrl(filePath);

  const logoUrl = publicUrlData.publicUrl;

  const { error: updateError } = await adminSupabase
    .from('clients')
    .update({ logo_url: logoUrl })
    .eq('id', clientId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ logoUrl });
}
