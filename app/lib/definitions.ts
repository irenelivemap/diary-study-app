/**
 * Holds shared TypeScript definitions used across the app.
 */
export type SessionPayload = {
  userId: string
  role: 'ADMIN' | 'PARTICIPANT'
  name: string
  email: string
}
