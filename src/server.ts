import dotenv from 'dotenv'
dotenv.config()

import path from 'path'
import express from 'express'
import cors from 'cors'
import { sequelize, ensureDatabaseExists, migrateAfterSchoolClassLevelColumn, migrateUserRoleColumn } from './config/database'
import './models' // register all models before sync
import routes from './routes'
import { errorHandler } from './middleware/errorHandler'
import { seedDefaults } from './seed/seedDefaults'
import { seedCatalog } from './seed/seedCatalog'

const PORT = Number(process.env.PORT || 8000)

async function main() {
  // 1. Make sure the target database exists.
  await ensureDatabaseExists()

  // 2. Connect and auto-create any tables that don't exist yet.
  await sequelize.authenticate()
  await sequelize.sync()
  await migrateAfterSchoolClassLevelColumn()
  await migrateUserRoleColumn()
  console.log('[db] Connected and tables synced')

  // 3. Seed the default Super Admin (+ demo accounts) and starter catalog.
  await seedDefaults()
  await seedCatalog()

  // 4. Start the HTTP server.
  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))
  app.use('/api/v1', routes)
  app.use(errorHandler)

  app.listen(PORT, () => {
    console.log(`[server] School Management System API listening on http://127.0.0.1:${PORT}/api/v1`)
  })
}

main().catch((err) => {
  console.error('[fatal] Failed to start server:', err)
  process.exit(1)
})
