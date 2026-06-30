-- Google OAuth, invite-first sign-in.
--
-- Team members sign in with Google IF AND ONLY IF an admin has already added
-- their email to profiles. There is no self-registration: the only path that
-- creates an auth.users row is an admin invite (which always stamps invited_by
-- in user metadata). A random Google sign-in therefore produces an auth user
-- with NO profile, and /auth/callback rejects + deletes that orphan.

-- 1. Track invite state and which method a user signs in with.
--    Existing rows default to 'active'/'password' (they were email-invited and
--    have already signed in); the backfill below corrects never-signed-in users.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signin_method text NOT NULL DEFAULT 'password'
    CHECK (signin_method IN ('google', 'password'));

-- Invited-but-never-signed-in users are still pending.
UPDATE public.profiles p
SET status = 'pending'
FROM auth.users u
WHERE u.id = p.id
  AND u.last_sign_in_at IS NULL;

-- 2. Invite-only auto-profile trigger.
--    Only admin-invited users (metadata has invited_by) or the super admin get
--    a profile. status/signin_method come from invite metadata so a Google
--    invite lands as ('pending','google') and an email invite as
--    ('pending','password').
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_invited boolean := NEW.raw_user_meta_data ? 'invited_by';
  v_is_super boolean := lower(NEW.email) = 'alex@shtud.io';
BEGIN
  -- Not invited and not the super admin? Leave auth.users alone with no profile
  -- so the OAuth callback can reject the sign-in.
  IF NOT v_invited AND NOT v_is_super THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, role, can_delete_files,
    invited_by, invited_at, status, signin_method
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'client'),
    COALESCE((NEW.raw_user_meta_data->>'can_delete_files')::boolean, FALSE),
    NULLIF(NEW.raw_user_meta_data->>'invited_by', '')::uuid,
    CASE WHEN v_invited THEN now() ELSE NULL END,
    COALESCE(
      NEW.raw_user_meta_data->>'status',
      CASE WHEN v_is_super THEN 'active' ELSE 'pending' END
    ),
    COALESCE(NEW.raw_user_meta_data->>'signin_method', 'password')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure alex@shtud.io always retains delete permission + active status.
UPDATE public.profiles
SET can_delete_files = TRUE, status = 'active'
WHERE email = 'alex@shtud.io';
