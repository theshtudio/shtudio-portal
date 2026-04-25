ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_delete_files BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE public.profiles SET can_delete_files = TRUE WHERE email = 'alex@shtud.io';
