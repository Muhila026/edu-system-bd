import { Router } from 'express'
import { sequelize } from '../config/database'
import { User } from '../models/User'
import { TransactionType, PaymentMode } from '../models/Transaction'
import { requireAuth, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'
import { applyPayment, ApplyPaymentError } from '../services/applyPayment'

const router = Router()

type ManualPaymentBody = {
  studentEmail?: string
  type?: TransactionType
  referenceId?: string
  amount?: number
  quantity?: number // 'Item' payments only
  paymentMode?: PaymentMode
  notes?: string
}

/**
 * POST /payments/manual — the single entry point for manual cash collection.
 *
 * Office/billing staff (Admin or Super Admin) key in what was physically collected at
 * the counter. Depending on `type`, this:
 *   - 'Fee'                : applies the cash against a FeeRecord's balance, marks it
 *                            Paid/Partial, and — for Admission/School Fees — reactivates
 *                            the student's account once fully paid ("unlocks access").
 *   - 'Item'                : deducts InventoryItem stock and issues the item to the
 *                            student (ItemRecord), refusing the sale if stock is insufficient.
 *   - 'After-School Class' : applies the cash as an installment against the student's
 *                            ClassEnrollment (auto-enrolling them if needed), activating
 *                            the enrollment once amountPaid covers the course fee.
 *
 * Every branch is wrapped in one DB transaction and always ends by writing a single
 * Transaction row (the audit trail / receipt) tagged with who collected the cash and when —
 * this is what the Super Admin's cash-reconciliation report reads from.
 *
 * See services/applyPayment.ts — the same logic backs payment-request approvals.
 */
router.post('/payments/manual', requireAuth, requireAdminOrStaffFor('Payments'), async (req: AuthedRequest, res, next) => {
  const t = await sequelize.transaction()
  try {
    const { studentEmail, type, referenceId, amount, quantity, paymentMode, notes } = req.body as ManualPaymentBody

    if (!studentEmail || !type || !referenceId || amount == null || amount <= 0) {
      await t.rollback()
      return res.status(400).json({ detail: 'studentEmail, type, referenceId and a positive amount are required' })
    }

    const student = await User.findOne({ where: { email: studentEmail.trim().toLowerCase(), role: 'Student' }, transaction: t })
    if (!student) {
      await t.rollback()
      return res.status(404).json({ detail: 'Student not found' })
    }

    const { transaction, receiptDetail } = await applyPayment(
      {
        student,
        type,
        referenceId,
        amount,
        quantity,
        paymentMode: paymentMode && ['Cash', 'Card', 'Online Transfer'].includes(paymentMode) ? paymentMode : 'Cash',
        notes,
        collectedByUserId: req.user!.sub,
      },
      t
    )

    await t.commit()

    res.status(201).json({
      receipt: {
        receiptNumber: transaction.receiptNumber,
        studentId: String(student.id),
        studentName: student.name,
        studentEmail: student.email,
        amount: Number(transaction.amount),
        paymentDate: transaction.paymentDate,
        paymentMode: transaction.paymentMode,
        type: transaction.type,
        collectedBy: req.user!.name,
      },
      detail: receiptDetail,
    })
  } catch (err) {
    await t.rollback()
    if (err instanceof ApplyPaymentError) return res.status(err.status).json({ detail: err.message })
    next(err)
  }
})

export default router
