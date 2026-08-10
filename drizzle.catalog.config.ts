import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './drizzle/catalog/schema.ts',
  out: './drizzle/catalog/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.CATALOG_DATABASE_URL!,
  },
})
