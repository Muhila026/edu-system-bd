import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { sequelize } from '../config/database'
import { PaymentRequest, PaymentRequestStatus } from '../models/PaymentRequest'
import { ParentChildLink } from '../models/ParentChildLink'
import { User } from '../models/User'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { InventoryItem } from '../models/InventoryItem'
import { AfterSchoolClass } from '../models/AfterSchoolClass'
import { TransactionType, PaymentMode } from '../models/Transaction'
import { requireAuth, requireRole, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'
import { applyPayment, ApplyPaymentError } from '../services/applyPayment'

const router = Router()

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'payment-proofs')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      cb(null, `${(req as AuthedRequest).user!.sub}-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Proof must be an image file'))
    cb(null, true)
  },
})

/** Human-readable name of what a request is for (fee title, item name, or class name). */
async function resolveLabel(type: TransactionType, referenceId: number): Promise<string> {
  if (type === 'Fee') {
    const record = await FeeRecord.findByPk(referenceId)
    const structure = record ? await FeeStructure.findByPk(record.feeStructureId) : null
    return structure?.title ?? type
  }
  if (type === 'Item') {
    const item = await InventoryItem.findByPk(referenceId)
    return item?.name ?? type
  }
  const cls = await AfterSchoolClass.findByPk(referenceId)
  return cls?.name ?? type
}

async function serialize(r: PaymentRequest) {
  const [student, submittedBy, reviewedBy, label] = await Promise.all([
    User.findByPk(r.studentId),
    User.findByPk(r.submittedByUserId),
    r.reviewedByUserId ? User.findByPk(r.reviewedByUserId) : null,
    resolveLabel(r.type, r.referenceId),
  ])
  return {
    id: String(r.id),
    studentId: String(r.studentId),
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    submittedByName: submittedBy?.name ?? '',
    submittedByRole: submittedBy?.role ?? '',
    type: r.type,
    referenceId: String(r.referenceId),
    label,
    quantity: r.quantity,
    amount: Number(r.amount),
    paymentMode: r.paymentMode,
    receiptNumber: r.receiptNumber,
    proofImageUrl: `/uploads/payment-proofs/${path.basename(r.proofImagePath)}`,
    note: r.note,
    status: r.status,
    reviewedByName: reviewedBy?.name ?? null,
    reviewNote: r.reviewNote,
    reviewedAt: r.reviewedAt,
    createdAt: r.get('createdAt'),
  }
}

/** Resolves which student a submission is for, verifying a parent actually owns that child. */
async function resolveTargetStudent(req: AuthedRequest, bodyStudentId?: string): Promise<User | null> {
  if (req.user!.role === 'student') return User.findByPk(req.user!.sub)
  if (!bodyStudentId) return null
  const link = await ParentChildLink.findOne({ where: { parentUserId: req.user!.sub, studentUserId: bodyStudentId } })
  if (!link) return null
  return User.findByPk(bodyStudentId)
}

// POST /payment-requests — student/parent submits proof of an online transfer for review.
router.post(
  '/payment-requests',
  requireAuth,
  requireRole('student', 'parent'),
  upload.single('proof'),
  async (req: AuthedRequest, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ detail: 'A proof image is required' })

      const { studentId, type, referenceId, quantity, amount, receiptNumber, note } = req.body as {
        studentId?: string
        type?: TransactionType
        referenceId?: string
        quantity?: string
        amount?: string
        receiptNumber?: string
        note?: string
      }

      const student = await resolveTargetStudent(req, studentId)
      if (!student) return res.status(403).json({ detail: 'Not your child, or student not found' })

      if (!type || !referenceId || !amount || Number(amount) <= 0) {
        return res.status(400).json({ detail: 'type, referenceId and a positive amount are required' })
      }
      if (!['Fee', 'Item', 'After-School Class'].includes(type)) {
        return res.status(400).json({ detail: "type must be one of 'Fee', 'Item', 'After-School Class'" })
      }

      const request = await PaymentRequest.create({
        studentId: student.id,
        submittedByUserId: req.user!.sub,
        type,
        referenceId: Number(referenceId),
        quantity: quantity ? Number(quantity) : null,
        amount: Number(amount),
        paymentMode: 'Online Transfer',
        receiptNumber: receiptNumber?.trim() || null,
        proofImagePath: req.file.filename,
        note: note?.trim() || null,
        status: 'Pending',
      })

      res.status(201).json(await serialize(request))
    } catch (err) {
      next(err)
    }
  }
)

// GET /payment-requests/me — the logged-in student's own submissions.
router.get('/payment-requests/me', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const rows = await PaymentRequest.findAll({ where: { studentId: req.user!.sub }, order: [['id', 'DESC']] })
    res.json(await Promise.all(rows.map(serialize)))
  } catch (err) {
    next(err)
  }
})

// GET /parents/children/:studentId/payment-requests — a parent's submissions for one child.
router.get(
  '/parents/children/:studentId/payment-requests',
  requireAuth,
  requireRole('parent'),
  async (req: AuthedRequest, res, next) => {
    try {
      const link = await ParentChildLink.findOne({ where: { parentUserId: req.user!.sub, studentUserId: req.params.studentId } })
      if (!link) return res.status(403).json({ detail: 'Not your child' })
      const rows = await PaymentRequest.findAll({ where: { studentId: req.params.studentId }, order: [['id', 'DESC']] })
      res.json(await Promise.all(rows.map(serialize)))
    } catch (err) {
      next(err)
    }
  }
)

// GET /payment-requests?status= — admin: review queue.
router.get('/payment-requests', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const { status } = req.query as { status?: PaymentRequestStatus }
    const where = status ? { status } : {}
    const rows = await PaymentRequest.findAll({ where, order: [['id', 'DESC']] })
    res.json(await Promise.all(rows.map(serialize)))
  } catch (err) {
    next(err)
  }
})

// PUT /payment-requests/:id/approve — admin verifies the proof and finalizes the payment.
router.put('/payment-requests/:id/approve', requireAuth, requireAdminOrStaffFor('Payments'), async (req: AuthedRequest, res, next) => {
  const t = await sequelize.transaction()
  try {
    // Lock the row (SELECT ... FOR UPDATE) so a second concurrent approve/reject on the same
    // request blocks until this transaction commits, then re-reads the now-non-Pending status
    // instead of racing past the check below and double-applying the payment.
    const request = await PaymentRequest.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!request) {
      await t.rollback()
      return res.status(404).json({ detail: 'Payment request not found' })
    }
    if (request.status !== 'Pending') {
      await t.rollback()
      return res.status(409).json({ detail: `This request was already ${request.status.toLowerCase()}` })
    }

    const { paymentMode } = req.body as { paymentMode?: PaymentMode }
    const mode: PaymentMode = paymentMode && ['Cash', 'Card', 'Online Transfer'].includes(paymentMode) ? paymentMode : request.paymentMode

    const student = await User.findByPk(request.studentId, { transaction: t })
    if (!student) {
      await t.rollback()
      return res.status(404).json({ detail: 'Student not found' })
    }

    const { transaction } = await applyPayment(
      {
        student,
        type: request.type,
        referenceId: String(request.referenceId),
        amount: Number(request.amount),
        quantity: request.quantity ?? undefined,
        paymentMode: mode,
        notes: request.note ?? undefined,
        collectedByUserId: req.user!.sub,
      },
      t
    )

    request.status = 'Approved'
    request.paymentMode = mode
    request.reviewedByUserId = req.user!.sub
    request.reviewedAt = new Date()
    request.transactionId = transaction.id
    await request.save({ transaction: t })

    await t.commit()
    res.json(await serialize(request))
  } catch (err) {
    await t.rollback()
    if (err instanceof ApplyPaymentError) return res.status(err.status).json({ detail: err.message })
    next(err)
  }
})

// PUT /payment-requests/:id/reject — admin declines the request (e.g. proof doesn't check out).
router.put('/payment-requests/:id/reject', requireAuth, requireAdminOrStaffFor('Payments'), async (req: AuthedRequest, res, next) => {
  const t = await sequelize.transaction()
  try {
    // Same row lock as approve: without it, a reject racing a concurrent approve could read a
    // stale "Pending" status and overwrite an already-applied payment's status to Rejected.
    const request = await PaymentRequest.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!request) {
      await t.rollback()
      return res.status(404).json({ detail: 'Payment request not found' })
    }
    if (request.status !== 'Pending') {
      await t.rollback()
      return res.status(409).json({ detail: `This request was already ${request.status.toLowerCase()}` })
    }

    const { reviewNote } = req.body as { reviewNote?: string }
    request.status = 'Rejected'
    request.reviewedByUserId = req.user!.sub
    request.reviewedAt = new Date()
    request.reviewNote = reviewNote?.trim() || null
    await request.save({ transaction: t })

    await t.commit()
    res.json(await serialize(request))
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

export default router
