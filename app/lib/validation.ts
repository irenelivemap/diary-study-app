export function normalizeEmail(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function isValidReminderTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function normalizeTimezone(value: FormDataEntryValue | string | null | undefined) {
  const timezone = String(value ?? '').trim()
  if (!timezone) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format(new Date())
    return timezone
  } catch {
    return null
  }
}
