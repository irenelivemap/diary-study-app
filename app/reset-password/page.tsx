import Link from 'next/link'
import { prisma } from '@/app/lib/db'
import { passwordResetTokenHash } from '@/app/lib/password-reset'
import ResetPasswordForm from '@/app/components/auth/ResetPasswordForm'

async function isUsableResetToken(token: string) {
  if (!token) return false
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: passwordResetTokenHash(token) },
    select: { expiresAt: true, usedAt: true },
  })
  return !!resetToken && !resetToken.usedAt && resetToken.expiresAt > new Date()
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = '' } = await searchParams
  const tokenIsUsable = await isUsableResetToken(token)

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 flex-col justify-between p-12">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">diARI</span>
        </div>
        <div>
          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Choose a new<br />password.
          </h2>
          <p className="text-indigo-200 text-lg leading-relaxed">
            Use a password you do not reuse on other services.
          </p>
        </div>
        <p className="text-indigo-300 text-sm">This link can only be used once</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <span className="font-semibold text-slate-900 text-lg">diARI</span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-1">Create a new password</h1>
          <p className="text-slate-500 text-sm mb-8">
            Your new password must be at least 8 characters.
          </p>

          {tokenIsUsable ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-4">
              <div className="text-sm text-red-700 bg-red-50 rounded-xl px-4 py-3 border border-red-100">
                This reset link is invalid or has expired. Request a new password reset link.
              </div>
              <Link href="/forgot-password" className="inline-flex w-full h-12 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-5 text-base font-semibold text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]">
                Request new link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
