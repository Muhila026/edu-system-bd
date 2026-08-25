import { Router } from 'express'
import { Transaction, TransactionType } from '../models/Transaction'
import { User } from '../models/User'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { InventoryItem } from '../models/InventoryItem'
import { AfterSchoolClass } from '../models/AfterSchoolClass'
import { requireAuth, requireRole, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'
import { proofImageUrl } from '../middleware/proofUpload'

const router = Router()

/** Human-readable name of what a transaction paid for (the fee title, item name, or class name). */
async function resolveLabel(t: Transaction): Promise<string> {
  if (t.referenceId == null) return t.type
  if (t.type === 'Fee') {
    const record = await FeeRecord.findByPk(t.referenceId)
    const structure = record ? await FeeStructure.findByPk(record.feeStructureId) : null
    return structure?.title ?? t.type
  }
  if (t.type === 'Item') {
    const item = await InventoryItem.findByPk(t.referenceId)
    return item?.name ?? t.type
  }
  const cls = await AfterSchoolClass.findByPk(t.referenceId)
  return cls?.name ?? t.type
}

async function serialize(t: Transaction) {
  const student = await User.findByPk(t.studentId)
  return {
    id: String(t.id),
    studentId: String(t.studentId),
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    amount: Number(t.amount),
    paymentDate: t.paymentDate,
    type: t.type,
    label: await resolveLabel(t),
    referenceId: t.referenceId != null ? String(t.referenceId) : null,
    receiptNumber: t.receiptNumber,
    paymentMode: t.paymentMode,
    notes: t.notes,
    proofImageUrl: proofImageUrl(t.proofImagePath),
  }
}

// GET /transactions?studentEmail=&type= — fee collection report
router.get('/transactions', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const { studentEmail, type } = req.query as { studentEmail?: string; type?: TransactionType }
    const where: Record<string, unknown> = {}
    if (studentEmail) {
      const student = await User.findOne({ where: { email: studentEmail } })
      where.studentId = student?.id ?? -1
    }
    if (type) where.type = type
    const transactions = await Transaction.findAll({ where, order: [['id', 'DESC']] })
    res.json(await Promise.all(transactions.map(serialize)))
  } catch (err) {
    next(err)
  }
})

// GET /transactions/me?type= — the logged-in student's own payment/receipt history
router.get('/transactions/me', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const { type } = req.query as { type?: TransactionType }
    const where: Record<string, unknown> = { studentId: req.user!.sub }
    if (type) where.type = type
    const transactions = await Transaction.findAll({ where, order: [['id', 'DESC']] })
    res.json(await Promise.all(transactions.map(serialize)))
  } catch (err) {
    next(err)
  }
})

export default router
