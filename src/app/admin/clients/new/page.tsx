'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button/Button';
import { Input, Textarea } from '@/components/Input/Input';
import Link from 'next/link';
import styles from './page.module.css';

export default function NewClientPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { error: insertError } = await supabase.from('clients').insert({
      name,
      slug,
      website: form.get('website') as string || null,
      primary_contact_name: form.get('contact_name') as string || null,
      primary_contact_email: form.get('contact_email') as string || null,
      notes: form.get('notes') as string || null,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push('/admin/clients');
    router.refresh();
  }

  return (
    <>
      <h1 className={styles.heading}>New Client</h1>

      <form className={styles.form} onSubmit={handleSubmit}>
        {error && <div className={styles.error}>{error}</div>}

        <Input
          label="Client Name"
          name="name"
          placeholder="e.g. Acme Corp"
          required
        />

        <Input
          label="Website"
          name="website"
          placeholder="https://example.com"
          type="url"
        />

        <div className={styles.row}>
          <Input
            label="Contact Name"
            name="contact_name"
            placeholder="John Smith"
          />
          <Input
            label="Contact Email"
            name="contact_email"
            placeholder="john@example.com"
            type="email"
          />
        </div>

        <Textarea
          label="Notes"
          name="notes"
          placeholder="Internal notes about this client..."
        />

        <div className={styles.actions}>
          <Button type="submit" loading={loading}>
            Create Client
          </Button>
          <Link href="/admin/clients">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
