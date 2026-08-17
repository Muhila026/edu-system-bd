import { Router } from 'express'
import { Op, fn, col, literal } from 'sequelize'
import { User } from '../models/User'
import { Transaction } from '../models/Transaction'
import { requireAuth, requireAdminOrAbove } from '../middleware/auth'

const router = Router()

const OTHER_ROLES: Array<User['role']> = ['Admin', 'Super Admin', 'Parent']

/**
 * GET /admin/dashboard — admin dashboard overview: user counts by role,
 * today's cash collection, and a daily payment total for the last 30 days
 * (for the payment analysis chart).
 */
router.get('/admin/dashboard', requireAuth, requireAdminOrAbove, async (_req, res, next) => {
  try {
    const [totalUsers, students, teachers, other] = await Promise.all([
      User.count(),
      User.count({ where: { role: 'Student' } }),
      User.count({ where: { role: 'Teacher' } }),
      User.count({ where: { role: { [Op.in]: OTHER_ROLES } } }),
    ])

    const today = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const [todayRows, seriesRows] = await Promise.all([
      Transaction.findAll({
        where: { paymentDate: today },
        attributes: [[fn('SUM', col('amount')), 'total']],
        raw: true,
      }),
      Transaction.findAll({
        where: { paymentDate: { [Op.gte]: thirtyDaysAgo } },
        attributes: ['paymentDate', [fn('SUM', col('amount')), 'total']],
        group: ['paymentDate'],
        order: [[literal('paymentDate'), 'ASC']],
        raw: true,
      }),
    ])

    const todayCollection = Number((todayRows[0] as any)?.total ?? 0)
    const paymentSeries = (seriesRows as unknown as Array<{ paymentDate: string; total: string }>).map((r) => ({
      date: r.paymentDate,
      total: Number(r.total),
    }))

    res.json({
      counts: { totalUsers, students, teachers, other },
      todayCollection,
      paymentSeries,
    })
  } catch (err) {
    next(err)
  }
})

export default router
