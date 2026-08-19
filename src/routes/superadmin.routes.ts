import { Router } from 'express'
import { Op, fn, col } from 'sequelize'
import { Transaction } from '../models/Transaction'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { User } from '../models/User'
import { requireAuth, requireSuperAdmin } from '../middleware/auth'
import { sequelize } from '../config/database'

const router = Router()

/** Every table name in the current database, in a stable order. */
async function getAllTableNames(): Promise<string[]> {
  const [rows] = await sequelize.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`
  )
  return (rows as Array<{ TABLE_NAME: string }>).map((r) => r.TABLE_NAME)
}

/** Renders a JS value as a MySQL SQL literal for use inside a generated INSERT statement. */
function formatSqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  return `'${String(value).replace(/[\\']/g, '\\$&')}'`
}

/**
 * GET /superadmin/analytics/financial — CEO/management overview: total cash collected,
 * outstanding fee balances, and a breakdown by transaction type and fee category.
 */
router.get('/superadmin/analytics/financial', requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const [collectedRows, outstandingRecords, byType, recentTransactions] = await Promise.all([
      Transaction.findAll({ attributes: [[fn('SUM', col('amount')), 'total']], raw: true }),
      FeeRecord.findAll({ where: { status: { [Op.ne]: 'Paid' } } }),
      Transaction.findAll({
        attributes: ['type', [fn('SUM', col('amount')), 'total'], [fn('COUNT', col('id')), 'count']],
        group: ['type'],
        raw: true,
      }),
      Transaction.findAll({ order: [['id', 'DESC']], limit: 20 }),
    ])

    const totalCollected = Number((collectedRows[0] as any)?.total ?? 0)
    const totalOutstanding = outstandingRecords.reduce(
      (sum, r) => sum + (Number(r.amount) - Number(r.paidAmount)),
      0
    )

    const collectedByType = (byType as unknown as Array<{ type: string; total: string; count: string }>).map((r) => ({
      type: r.type,
      total: Number(r.total),
      count: Number(r.count),
    }))

    const recent = await Promise.all(
      recentTransactions.map(async (t) => {
        const student = await User.findByPk(t.studentId)
        const collector = t.collectedByUserId ? await User.findByPk(t.collectedByUserId) : null
        return {
          id: String(t.id),
          receiptNumber: t.receiptNumber,
          studentName: student?.name ?? '',
          amount: Number(t.amount),
          type: t.type,
          paymentDate: t.paymentDate,
          paymentMode: t.paymentMode,
          collectedBy: collector?.name ?? null,
        }
      })
    )

    res.json({
      totalCollected,
      totalOutstanding,
      outstandingRecordCount: outstandingRecords.length,
      collectedByType,
      recentTransactions: recent,
    })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /superadmin/analytics/cash-reconciliation?date=YYYY-MM-DD — daily cash audit.
 * Every transaction recorded that day, grouped by the staff member who collected it,
 * so the day's physical cash drawer can be checked against the system total.
 */
router.get('/superadmin/analytics/cash-reconciliation', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10)
    const transactions = await Transaction.findAll({ where: { paymentDate: date }, order: [['id', 'DESC']] })

    const byCollector = new Map<string, { collectedByUserId: number | null; collectorName: string; total: number; count: number }>()
    for (const t of transactions) {
      const key = String(t.collectedByUserId ?? 'unknown')
      if (!byCollector.has(key)) {
        const collector = t.collectedByUserId ? await User.findByPk(t.collectedByUserId) : null
        byCollector.set(key, {
          collectedByUserId: t.collectedByUserId,
          collectorName: collector?.name ?? 'Unknown',
          total: 0,
          count: 0,
        })
      }
      const entry = byCollector.get(key)!
      entry.total += Number(t.amount)
      entry.count += 1
    }

    const lines = await Promise.all(
      transactions.map(async (t) => {
        const student = await User.findByPk(t.studentId)
        return {
          id: String(t.id),
          receiptNumber: t.receiptNumber,
          studentName: student?.name ?? '',
          type: t.type,
          amount: Number(t.amount),
          paymentMode: t.paymentMode,
        }
      })
    )

    res.json({
      date,
      totalCash: transactions.reduce((sum, t) => sum + Number(t.amount), 0),
      transactionCount: transactions.length,
      byCollector: Array.from(byCollector.values()),
      transactions: lines,
    })
  } catch (err) {
    next(err)
  }
})

/** GET /superadmin/export/structure — a .sql dump of every table's CREATE TABLE statement (schema only, no rows). */
router.get('/superadmin/export/structure', requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const tableNames = await getAllTableNames()
    let sql = `-- Database structure export — ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`
    for (const name of tableNames) {
      const [rows] = await sequelize.query(`SHOW CREATE TABLE \`${name}\``)
      const createStatement = (rows as Array<Record<string, string>>)[0]['Create Table']
      sql += `DROP TABLE IF EXISTS \`${name}\`;\n${createStatement};\n\n`
    }
    sql += 'SET FOREIGN_KEY_CHECKS=1;\n'

    res.setHeader('Content-Type', 'application/sql; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="structure_${Date.now()}.sql"`)
    res.send(sql)
  } catch (err) {
    next(err)
  }
})

/** GET /superadmin/export/data — a .sql dump of every table's rows as INSERT statements (data only, no schema). */
router.get('/superadmin/export/data', requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const tableNames = await getAllTableNames()
    let sql = `-- Database data export — ${new Date().toISOString()}\n\nSET FOREIGN_KEY_CHECKS=0;\n\n`
    for (const name of tableNames) {
      const [rows] = await sequelize.query(`SELECT * FROM \`${name}\``)
      const records = rows as Array<Record<string, unknown>>
      if (records.length === 0) continue

      const columns = Object.keys(records[0])
      const columnList = columns.map((c) => `\`${c}\``).join(', ')
      sql += `-- Table: ${name} (${records.length} rows)\n`
      for (const record of records) {
        const values = columns.map((c) => formatSqlValue(record[c])).join(', ')
        sql += `INSERT INTO \`${name}\` (${columnList}) VALUES (${values});\n`
      }
      sql += '\n'
    }
    sql += 'SET FOREIGN_KEY_CHECKS=1;\n'

    res.setHeader('Content-Type', 'application/sql; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="data_${Date.now()}.sql"`)
    res.send(sql)
  } catch (err) {
    next(err)
  }
})

export default router
