import { Router } from 'express'
import { FeeStructure, FeeType } from '../models/FeeStructure'
import { FeeRecord } from '../models/FeeRecord'
import { User } from '../models/User'
import { Transaction } from '../models/Transaction'
import { Grade } from '../models/Grade'
import { Term } from '../models/Term'
import { AcademicYear } from '../models/AcademicYear'
import { StudentProfile } from '../models/StudentProfile'
import { requireAuth, requireRole, requireAdminOrAbove, AuthedRequest } from '../middleware/auth'

const router = Router()

async function serializeStructure(f: FeeStructure) {
  const [grade, term, academicYear] = await Promise.all([
    f.gradeId ? Grade.findByPk(f.gradeId) : null,
    f.termId ? Term.findByPk(f.termId) : null,
    f.academicYearId ? AcademicYear.findByPk(f.academicYearId) : null,
  ])
  let packageItems: Array<{ id: string; title: string; amount: number }> = []
  if (f.isPackage && f.packageItems) {
    const ids: number[] = JSON.parse(f.packageItems)
    const members = await FeeStructure.findAll({ where: { id: ids } })
    packageItems = members.map((m) => ({ id: String(m.id), title: m.title, amount: Number(m.amount) }))
  }
  return {
    id: String(f.id),
    feeType: f.feeType,
    title: f.title,
    description: f.description,
    amount: Number(f.amount),
    dueDate: f.dueDate,
    academicYearId: f.academicYearId != null ? String(f.academicYearId) : null,
    academicYear: academicYear?.year ?? null,
    gradeId: f.gradeId != null ? String(f.gradeId) : null,
    gradeName: grade?.name ?? null,
    termId: f.termId != null ? String(f.termId) : null,
    termName: term?.name ?? null,
    isPackage: f.isPackage,
    packageItems,
  }
}

async function serializeStructures(structures: FeeStructure[]) {
  return Promise.all(structures.map(serializeStructure))
}

async function serializeRecord(r: FeeRecord) {
  const [structure, student] = await Promise.all([
    FeeStructure.findByPk(r.feeStructureId),
    User.findByPk(r.studentId),
  ])
  const grade = structure?.gradeId ? await Grade.findByPk(structure.gradeId) : null
  return {
    id: String(r.id),
    feeStructureId: String(r.feeStructureId),
    feeType: structure?.feeType ?? 'School Fee',
    title: structure?.title ?? '',
    amount: Number(r.amount),
    dueDate: structure?.dueDate ?? null,
    gradeName: grade?.name ?? null,
    studentId: String(r.studentId),
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    status: r.status,
    paidAmount: Number(r.paidAmount),
    paidDate: r.paidDate,
  }
}

async function serializeRecords(records: FeeRecord[]) {
  return Promise.all(records.map(serializeRecord))
}

// ---- Fee structures (catalog) ----

// Optional filters: ?academicYearId=&gradeId=&termId= — e.g. "Grade 1, Term 1, 2026" browsing.
router.get('/fees/structures', requireAuth, async (req, res, next) => {
  try {
    const { academicYearId, gradeId, termId } = req.query as {
      academicYearId?: string
      gradeId?: string
      termId?: string
    }
    const where: Record<string, unknown> = {}
    if (academicYearId) where.academicYearId = academicYearId
    if (gradeId) where.gradeId = gradeId
    if (termId) where.termId = termId

    const structures = await FeeStructure.findAll({ where, order: [['id', 'DESC']] })
    res.json(await serializeStructures(structures))
  } catch (err) {
    next(err)
  }
})

router.post('/fees/structures', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { feeType, title, description, amount, dueDate, academicYearId, gradeId, termId, isPackage, packageItemIds } = req.body as {
      feeType?: FeeType
      title?: string
      description?: string
      amount?: number
      dueDate?: string | null
      academicYearId?: string | null
      gradeId?: string | null
      termId?: string | null
      isPackage?: boolean
      packageItemIds?: string[]
    }
    if (!feeType || !title?.trim()) {
      return res.status(400).json({ detail: 'feeType and title are required' })
    }

    let finalAmount = amount ?? 0
    let packageItemsJson: string | null = null
    if (isPackage) {
      if (!packageItemIds || packageItemIds.length < 2) {
        return res.status(400).json({ detail: 'A package needs at least 2 member fees' })
      }
      const members = await FeeStructure.findAll({ where: { id: packageItemIds.map(Number) } })
      finalAmount = members.reduce((sum, m) => sum + Number(m.amount), 0)
      packageItemsJson = JSON.stringify(packageItemIds.map(Number))
    } else if (amount == null) {
      return res.status(400).json({ detail: 'amount is required' })
    }

    await FeeStructure.create({
      feeType,
      title: title.trim(),
      description: description?.trim() || null,
      amount: finalAmount,
      dueDate: dueDate || null,
      academicYearId: academicYearId ? Number(academicYearId) : null,
      gradeId: gradeId ? Number(gradeId) : null,
      termId: termId ? Number(termId) : null,
      isPackage: !!isPackage,
      packageItems: packageItemsJson,
    })
    const structures = await FeeStructure.findAll({ order: [['id', 'DESC']] })
    res.status(201).json(await serializeStructures(structures))
  } catch (err) {
    next(err)
  }
})

router.delete('/fees/structures/:id', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const structure = await FeeStructure.findByPk(req.params.id)
    if (!structure) return res.status(404).json({ detail: 'Fee structure not found' })
    await structure.destroy()
    const structures = await FeeStructure.findAll({ order: [['id', 'DESC']] })
    res.json(await serializeStructures(structures))
  } catch (err) {
    next(err)
  }
})

// ---- Fee records (per-student) ----

router.get('/fees/records', requireAuth, requireRole('admin', 'super_admin', 'teacher'), async (req, res, next) => {
  try {
    const { studentEmail } = req.query as { studentEmail?: string }
    let where = {}
    if (studentEmail) {
      const student = await User.findOne({ where: { email: studentEmail } })
      where = { studentId: student?.id ?? -1 }
    }
    const records = await FeeRecord.findAll({ where, order: [['id', 'DESC']] })
    res.json(await serializeRecords(records))
  } catch (err) {
    next(err)
  }
})

router.get('/fees/me', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const records = await FeeRecord.findAll({ where: { studentId: req.user!.sub }, order: [['id', 'DESC']] })
    res.json(await serializeRecords(records))
  } catch (err) {
    next(err)
  }
})

router.post('/fees/records', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { feeStructureId, studentEmail } = req.body as { feeStructureId?: string; studentEmail?: string }
    if (!feeStructureId || !studentEmail) {
      return res.status(400).json({ detail: 'feeStructureId and studentEmail are required' })
    }
    const structure = await FeeStructure.findByPk(feeStructureId)
    if (!structure) return res.status(404).json({ detail: 'Fee structure not found' })
    const student = await User.findOne({ where: { email: studentEmail, role: 'Student' } })
    if (!student) return res.status(404).json({ detail: 'Student not found' })

    await FeeRecord.create({
      feeStructureId: structure.id,
      studentId: student.id,
      amount: structure.amount,
    })
    const records = await FeeRecord.findAll({ where: { studentId: student.id }, order: [['id', 'DESC']] })
    res.status(201).json(await serializeRecords(records))
  } catch (err) {
    next(err)
  }
})

// Bulk-assign a fee to every student in a grade — a school gives fees to a whole class,
// not to students one at a time. Skips students who already have a record for this fee.
router.post('/fees/records/assign-class', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { feeStructureId, gradeId } = req.body as { feeStructureId?: string; gradeId?: string }
    if (!feeStructureId || !gradeId) {
      return res.status(400).json({ detail: 'feeStructureId and gradeId are required' })
    }
    const structure = await FeeStructure.findByPk(feeStructureId)
    if (!structure) return res.status(404).json({ detail: 'Fee structure not found' })
    const grade = await Grade.findByPk(gradeId)
    if (!grade) return res.status(404).json({ detail: 'Grade not found' })

    const profiles = await StudentProfile.findAll({ where: { gradeId: Number(gradeId) } })
    let created = 0
    for (const profile of profiles) {
      const [, wasCreated] = await FeeRecord.findOrCreate({
        where: { feeStructureId: structure.id, studentId: profile.userId },
        defaults: { feeStructureId: structure.id, studentId: profile.userId, amount: structure.amount },
      })
      if (wasCreated) created++
    }

    res.status(201).json({ studentsInGrade: profiles.length, created, alreadyAssigned: profiles.length - created })
  } catch (err) {
    next(err)
  }
})

router.post('/fees/records/:id/pay', requireAuth, requireAdminOrAbove, async (req: AuthedRequest, res, next) => {
  try {
    const record = await FeeRecord.findByPk(req.params.id)
    if (!record) return res.status(404).json({ detail: 'Fee record not found' })
    // paidAmount here is the new absolute total paid (matches the admin UI, which
    // already adds the entered amount to the current paidAmount before calling this).
    const { paidAmount, paymentMode } = req.body as { paidAmount?: number; paymentMode?: 'Cash' | 'Card' | 'Online Transfer' }
    if (paidAmount == null || paidAmount <= Number(record.paidAmount)) {
      return res.status(400).json({ detail: 'paidAmount must be greater than the amount already paid' })
    }

    const delta = paidAmount - Number(record.paidAmount)
    const newPaid = Math.min(Number(record.amount), paidAmount)
    record.paidAmount = newPaid
    record.status = newPaid >= Number(record.amount) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'
    record.paidDate = new Date().toISOString().slice(0, 10)
    await record.save()

    await Transaction.create({
      studentId: record.studentId,
      amount: delta,
      paymentDate: new Date().toISOString().slice(0, 10),
      type: 'Fee',
      referenceId: record.id,
      receiptNumber: `RCPT-F${record.id}-${Date.now()}`,
      paymentMode: paymentMode || 'Cash',
      collectedByUserId: req.user?.sub ?? null,
    })

    const records = await FeeRecord.findAll({ where: { studentId: record.studentId }, order: [['id', 'DESC']] })
    res.json(await serializeRecords(records))
  } catch (err) {
    next(err)
  }
})

export default router
