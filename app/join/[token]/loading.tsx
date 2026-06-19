/**
 * Loading placeholder for the join/[token] route.
 */
export default function JoinInviteLoading() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Loading invite</p>
        <div className="mt-4 space-y-3" aria-live="polite" aria-busy="true">
          <div className="h-6 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-indigo-100" />
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Loading invite...</p>
      </div>
    </div>
  )
}
