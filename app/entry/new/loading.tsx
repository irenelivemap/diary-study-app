export default function NewEntryLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      <header className="sticky top-0 z-10 border-b border-[#E6E3DD] bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4 sm:px-6">
          <div className="h-9 w-16 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-8 flex-1 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-2xl border border-[#E6E3DD] bg-white p-5 shadow-sm">
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 h-28 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <p className="text-center text-sm text-slate-500">Opening entry...</p>
      </main>
    </div>
  )
}
