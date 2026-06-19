import { redirect } from 'next/navigation'

export default async function AdminSettingsPage() {
  redirect('/profile?from=admin&returnTo=/admin')
}
