import path from 'node:path'
import dotenv from 'dotenv'

// Single source of truth for local dev. In production (Vercel) these values
// come from the platform environment, so a missing .env file is fine.
const envPath = path.resolve(process.cwd(), '.env')

dotenv.config({ path: envPath })
