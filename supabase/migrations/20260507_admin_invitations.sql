-- Admin invitations: support inviting team members as admins with limited permissions.

-- Track who invited a user and when.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Update the auto-profile trigger to honor can_delete_files from invite metadata
-- (admins invited via supabase.auth.admin.inviteUserByEmail pass these in user_metadata).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, can_delete_files, invited_by, invited_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client'),
    COALESCE((NEW.raw_user_meta_data->>'can_delete_files')::boolean, FALSE),
    NULLIF(NEW.raw_user_meta_data->>'invited_by', '')::uuid,
    CASE
      WHEN NEW.raw_user_meta_data ? 'invited_by' THEN now()
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure alex@shtud.io always retains delete permission.
UPDATE public.profiles SET can_delete_files = TRUE WHERE email = 'alex@shtud.io';
