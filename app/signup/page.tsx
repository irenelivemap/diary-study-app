import SignupForm from '@/app/components/SignupForm'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">diARI</span>
        </div>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Your daily voice<br />matters.
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            Join a study and share your experiences. Each entry you submit helps researchers understand real life better.
          </p>
        </div>
        <p className="text-indigo-300 text-sm">Takes less than 5 minutes a day</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <span className="font-semibold text-slate-900 text-lg">diARI</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
          <p className="text-slate-500 text-sm mb-8">Join a diary study as a participant</p>

          <SignupForm invitedEmail={email ?? ''} />
        </div>
      </div>
    </div>
  )
}
