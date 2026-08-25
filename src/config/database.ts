import { Sequelize } from 'sequelize'
import dotenv from 'dotenv'

dotenv.config()

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_NAME = process.env.DB_NAME || 'school_management'
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
})

/** Creates the target database itself if it doesn't exist yet (before Sequelize connects to it). */
export async function ensureDatabaseExists(): Promise<void> {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  })
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
  await connection.end()
}

/**
 * `sequelize.sync()` only creates missing tables — it never alters an existing column's type.
 * The `after_school_classes.level` column used to be a fixed ENUM('O/L','A/L','All'); it's now a
 * free-form VARCHAR so admins can pick a specific grade too. Widen it in place on old databases.
 */
export async function migrateAfterSchoolClassLevelColumn(): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'after_school_classes' AND COLUMN_NAME = 'level'`
  )
  const dataType = (rows as Array<{ DATA_TYPE: string }>)[0]?.DATA_TYPE
  if (dataType && dataType !== 'varchar') {
    await sequelize.query(
      `ALTER TABLE after_school_classes MODIFY COLUMN level VARCHAR(50) NOT NULL DEFAULT 'All'`
    )
    console.log('[migrate] after_school_classes.level column widened from ENUM to VARCHAR')
  }
}

/**
 * The `users.role` ENUM used to be Student/Teacher/Admin/Super Admin/Parent only.
 * 'Staff' is a new limited-admin role (access to specific admin pages, toggled by a Super
 * Admin in Settings) — widen the enum in place on old databases so existing rows are untouched.
 */
export async function migrateUserRoleColumn(): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
  )
  const columnType = (rows as Array<{ COLUMN_TYPE: string }>)[0]?.COLUMN_TYPE
  if (columnType && !columnType.includes("'Staff'")) {
    await sequelize.query(
      `ALTER TABLE users MODIFY COLUMN role ENUM('Student','Teacher','Admin','Super Admin','Staff','Parent') NOT NULL`
    )
    console.log('[migrate] users.role column widened to include Staff')
  }
}

/**
 * `fee_structures.dueDate` (a single date) was replaced by a payment window: `dueDateStart`
 * (when it opens) and `dueDateEnd` (the actual due-by date). On an old database, rename the
 * existing column into `dueDateStart` so old due dates are preserved, then add `dueDateEnd`.
 * Sequelize maps attributes to identically-named columns here (no `underscored`/`field`
 * overrides anywhere in this codebase), so the actual column names are camelCase, not snake_case.
 */
export async function migrateFeeStructureDueDateColumns(): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_structures'
       AND COLUMN_NAME IN ('dueDate', 'dueDateStart', 'dueDateEnd')`
  )
  const columns = new Set((rows as Array<{ COLUMN_NAME: string }>).map((r) => r.COLUMN_NAME))
  if (columns.has('dueDate') && !columns.has('dueDateStart')) {
    await sequelize.query('ALTER TABLE fee_structures CHANGE COLUMN `dueDate` `dueDateStart` DATE NULL')
    console.log('[migrate] fee_structures.dueDate renamed to dueDateStart')
  }
  if (!columns.has('dueDateEnd')) {
    await sequelize.query('ALTER TABLE fee_structures ADD COLUMN `dueDateEnd` DATE NULL')
    console.log('[migrate] fee_structures.dueDateEnd column added')
  }
}

/**
 * `transactions.proofImagePath` is a new optional column — the receipt/proof image an
 * admin/staff member can attach when recording a payment. Add it in place on old databases.
 */
export async function migrateTransactionProofColumn(): Promise<void> {
  const [rows] = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'proofImagePath'`
  )
  if ((rows as unknown[]).length === 0) {
    await sequelize.query('ALTER TABLE transactions ADD COLUMN `proofImagePath` VARCHAR(255) NULL')
    console.log('[migrate] transactions.proofImagePath column added')
  }
}
