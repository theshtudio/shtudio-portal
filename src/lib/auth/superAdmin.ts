export const SUPER_ADMIN_EMAIL = 'alex@shtud.io';

export function isSuperAdmin(email: string | null | undefined): boolean {
  return email?.toLowerCase() === SUPER_ADMIN_EMAIL;
}
