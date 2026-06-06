import NavBar from '@/app/components/NavBar'

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />
}

export default function StudyLoading() {
  return (
    <div className="min-h-screen bg-[#F7F8FC]">
      <NavBar name="" role="ADMIN" />
      <div className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8">
          <SkeletonBlock className="h-9 w-32" />
          <SkeletonBlock className="mt-3 h-7 w-72" />
          <div className="mt-5 flex gap-3">
            <SkeletonBlock className="h-10 w-24" />
            <SkeletonBlock className="h-10 w-28" />
            <SkeletonBlock className="h-10 w-20" />
            <SkeletonBlock className="h-10 w-20" />
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-28" />
        </div>
        <SkeletonBlock className="h-80" />
      </main>
    </div>
  )
}
