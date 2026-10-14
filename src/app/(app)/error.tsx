"use client";

// One failed query (a Supabase hiccup, a lost connection) used to white-screen
// the whole app. This keeps the menu and shows a way to retry instead.
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="font-heading text-lg font-semibold text-ink">Algo salió mal</div>
      <p className="max-w-sm text-[13.5px] text-ink-muted">
        No pudimos cargar esta pantalla. Revisa tu conexión e inténtalo de nuevo.
      </p>
      <button onClick={reset} className="min-h-11 rounded-xl bg-brand px-5 text-[13.5px] font-semibold text-white">
        Reintentar
      </button>
    </div>
  );
}
