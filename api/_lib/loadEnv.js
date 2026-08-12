import path from 'node:path'
import dotenv from 'dotenv'

// Single source of truth for local dev. In production (Vercel) these values
// come from the platform environment, so a missing .env file is fine.
//
// Skipped under Vitest so a local test run behaves exactly like CI, which has
// no .env. Without this a test can pass on a developer machine purely because
// a real credential happened to be present, then fail on push — which is how
// the admin login suite broke: it never set SUPABASE_URL and only worked
// because .env supplied one. Tests must declare the environment they need.
if (!process.env.VITEST) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') })
}
