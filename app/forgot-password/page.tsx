import ForgotPasswordForm from '@/app/components/auth/ForgotPasswordForm'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">diARI</span>
        </div>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Get back to<br />your study.
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            We will send a secure reset link so you can choose a new password.
          </p>
        </div>
        <p className="text-indigo-300 text-sm">Reset links expire after 1 hour</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <span className="font-semibold text-slate-900 text-lg">diARI</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Reset your password</h1>
          <p className="text-slate-500 text-sm mb-8">
            Enter your account email and we will send a password reset link.
          </p>

          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  )
}
