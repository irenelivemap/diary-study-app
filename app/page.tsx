/**
 * Root route that redirects users to the right starting point.
 */
import { redirect } from 'next/navigation'
import { getSession } from '@/app/lib/session'

export default async function Home() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role === 'ADMIN') redirect('/admin')
  redirect('/dashboard')
}
