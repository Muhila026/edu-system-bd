import { Router } from 'express'
import { Op, fn, col } from 'sequelize'
import { Transaction } from '../models/Transaction'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { User } from '../models/User'
import { requireAuth, requireSuperAdmin } from '../middleware/auth'

const router = Router()

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

export default router
