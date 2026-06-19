/**
 * Loading placeholder for the entry/[id] route.
 */
export default function EntryLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4 sm:px-6">
          <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="h-5 w-40 animate-pulse rounded bg-slate-100" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <p className="text-center text-sm text-slate-500">Saving entry...</p>
      </main>
    </div>
  )
}
