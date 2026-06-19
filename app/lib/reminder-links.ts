/**
 * Builds participant-safe links used in reminder emails.
 */
export function reminderDashboardUrl(appUrl: string) {
  return `${appUrl.replace(/\/$/, '')}/dashboard`
}

export function reminderEntryUrl(appUrl: string, studyId: string, partId: string, journeyId?: string | null) {
  const url = `${appUrl.replace(/\/$/, '')}/entry/new?studyId=${studyId}&partId=${partId}`
  return journeyId ? `${url}&journeyId=${journeyId}` : url
}

export function reminderTargetUrl({
  appUrl,
  studyId,
  partId,
  journeyId,
  directEntryUrl,
  opensDashboard,
}: {
  appUrl: string
  studyId: string
  partId: string
  journeyId?: string | null
  directEntryUrl?: string
  opensDashboard: boolean
}) {
  return opensDashboard ? reminderDashboardUrl(appUrl) : directEntryUrl ?? reminderEntryUrl(appUrl, studyId, partId, journeyId)
}
