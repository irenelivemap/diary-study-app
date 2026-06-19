/**
 * Normalizes the database connection string before Prisma opens a Postgres connection.
 */
export function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')

  // Neon commonly gives sslmode=require. pg currently treats that like
  // verify-full and warns that this will change, so make the current behavior
  // explicit before pg parses the URL.
  return url.replace(/([?&])sslmode=require(?=&|$)/, '$1sslmode=verify-full')
}
