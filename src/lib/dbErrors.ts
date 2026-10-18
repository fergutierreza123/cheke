// What a person sees when Supabase refuses something. The database's own
// text is English and technical ("new row violates row-level security
// policy…"), so it never reaches the screen; it goes to the server log.
//
// The exception: cheke's database functions raise their own Spanish
// sentences on purpose ("Tu cuenta ya pertenece a un negocio."), with
// Postgres code P0001 (`raise exception`). Those are shown as they are.

export const SOMETHING_WENT_WRONG = "Algo salió mal. Inténtalo de nuevo.";
export const NOT_ALLOWED = "No tienes permiso para hacer este cambio.";

type DbError = { message?: string | null; code?: string | null } | null | undefined;

export function friendlyError(error: DbError, fallback: string = SOMETHING_WENT_WRONG): string {
  if (error?.code === "P0001" && error.message) return error.message;
  console.error("database error", error?.code, error?.message);
  // 42501 = insufficient privilege, which is what Row Level Security returns.
  if (error?.code === "42501") return NOT_ALLOWED;
  return fallback;
}
