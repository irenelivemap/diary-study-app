export type SessionPayload = {
  userId: string
  role: 'ADMIN' | 'PARTICIPANT'
  name: string
  email: string
}
