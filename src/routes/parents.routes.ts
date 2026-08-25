import { Router } from 'express'
import { User } from '../models/User'
import { Parent } from '../models/Parent'
import { ParentChildLink, GuardianRelationship } from '../models/ParentChildLink'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { ItemRecord } from '../models/ItemRecord'
import { Transaction } from '../models/Transaction'
import { StudentSubjectMarks } from '../models/StudentSubjectMarks'
import { Subject } from '../models/Subject'
import { requireAuth, requireAdminOrStaffFor, requireRole, AuthedRequest } from '../middleware/auth'
import { proofImageUrl } from '../middleware/proofUpload'

const router = Router()

// ==================== Admin: manage parent accounts + links ====================

router.get('/admin/parents', requireAuth, requireAdminOrStaffFor('User Management'), async (_req, res, next) => {
  try {
    const parents = await User.findAll({ where: { role: 'Parent' }, order: [['id', 'DESC']] })
    res.json(parents.map((p) => ({ id: p.id, name: p.name, email: p.email, status: p.status, joinedDate: p.joinedDate })))
  } catch (err) {
    next(err)
  }
})

/** Link an existing Parent account to an existing Student account. */
router.post('/admin/parents/link', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const { parentEmail, studentEmail, relationship } = req.body as {
      parentEmail?: string
      studentEmail?: string
      relationship?: GuardianRelationship
    }
    if (!parentEmail || !studentEmail) {
      return res.status(400).json({ detail: 'parentEmail and studentEmail are required' })
    }
    const [parent, student] = await Promise.all([
      User.findOne({ where: { email: parentEmail.trim().toLowerCase(), role: 'Parent' } }),
      User.findOne({ where: { email: studentEmail.trim().toLowerCase(), role: 'Student' } }),
    ])
    if (!parent) return res.status(404).json({ detail: 'Parent account not found' })
    if (!student) return res.status(404).json({ detail: 'Student account not found' })

    const existing = await ParentChildLink.findOne({ where: { parentUserId: parent.id, studentUserId: student.id } })
    if (existing) return res.status(409).json({ detail: 'This parent is already linked to this student' })

    const link = await ParentChildLink.create({
      parentUserId: parent.id,
      studentUserId: student.id,
      relationship: relationship && ['Father', 'Mother', 'Guardian'].includes(relationship) ? relationship : 'Guardian',
    })
    res.status(201).json({ id: String(link.id), parentEmail: parent.email, studentEmail: student.email, relationship: link.relationship })
  } catch (err) {
    next(err)
  }
})

router.delete('/admin/parents/link/:id', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const link = await ParentChildLink.findByPk(req.params.id)
    if (!link) return res.status(404).json({ detail: 'Link not found' })
    await link.destroy()
    res.json({ message: 'Link removed' })
  } catch (err) {
    next(err)
  }
})

// ---- Parent extended details (viewed/edited by admin) ----

async function serializeParentDetail(user: User) {
  const [profile, links] = await Promise.all([
    Parent.findOne({ where: { userId: user.id } }),
    ParentChildLink.findAll({ where: { parentUserId: user.id } }),
  ])
  const children = await Promise.all(
    links.map(async (l) => {
      const student = await User.findByPk(l.studentUserId)
      return { linkId: String(l.id), studentEmail: student?.email ?? '', studentName: student?.name ?? '', relationship: l.relationship }
    })
  )
  return {
    email: user.email,
    occupation: profile?.occupation ?? '',
    address: profile?.address ?? '',
    emergencyContact: profile?.emergencyContact ?? '',
    children,
  }
}

router.get('/admin/parents/:email/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.params.email, role: 'Parent' } })
    if (!user) return res.status(404).json({ detail: 'Parent not found' })
    res.json(await serializeParentDetail(user))
  } catch (err) {
    next(err)
  }
})

router.post('/admin/parents/:email/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const { occupation, address, emergencyContact } = req.body as {
      occupation?: string
      address?: string
      emergencyContact?: string
    }
    const user = await User.findOne({ where: { email: req.params.email, role: 'Parent' } })
    if (!user) return res.status(404).json({ detail: 'Parent not found' })
    const [profile] = await Parent.findOrCreate({ where: { userId: user.id } })
    if (occupation !== undefined) profile.occupation = occupation
    if (address !== undefined) profile.address = address
    if (emergencyContact !== undefined) profile.emergencyContact = emergencyContact
    await profile.save()
    res.json(await serializeParentDetail(user))
  } catch (err) {
    next(err)
  }
})

// ==================== Parent portal (read-only, scoped to own children) ====================

/** Resolves the child student, ensuring it actually belongs to the authenticated parent. */
async function resolveOwnChild(req: AuthedRequest, studentId: string) {
  const link = await ParentChildLink.findOne({ where: { parentUserId: req.user!.sub, studentUserId: studentId } })
  if (!link) return null
  return User.findByPk(studentId)
}

// ---- Parent self-service profile ----

router.get('/parents/profile', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const profile = await Parent.findOne({ where: { userId: user.id } })
    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone ?? null,
      occupation: profile?.occupation ?? '',
      address: profile?.address ?? '',
      emergencyContact: profile?.emergencyContact ?? '',
    })
  } catch (err) {
    next(err)
  }
})

router.post('/parents/profile', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const { fullName, phone, occupation, address, emergencyContact } = req.body as {
      fullName?: string
      phone?: string | null
      occupation?: string
      address?: string
      emergencyContact?: string
    }
    if (fullName?.trim()) user.name = fullName.trim()
    if (phone !== undefined) user.phone = phone
    await user.save()

    const [profile] = await Parent.findOrCreate({ where: { userId: user.id } })
    if (occupation !== undefined) profile.occupation = occupation
    if (address !== undefined) profile.address = address
    if (emergencyContact !== undefined) profile.emergencyContact = emergencyContact
    await profile.save()

    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone ?? null,
      occupation: profile.occupation ?? '',
      address: profile.address ?? '',
      emergencyContact: profile.emergencyContact ?? '',
    })
  } catch (err) {
    next(err)
  }
})

router.get('/parents/children', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const links = await ParentChildLink.findAll({ where: { parentUserId: req.user!.sub } })
    const children = await Promise.all(
      links.map(async (l) => {
        const student = await User.findByPk(l.studentUserId)
        return {
          studentId: String(l.studentUserId),
          name: student?.name ?? '',
          email: student?.email ?? '',
          relationship: l.relationship,
        }
      })
    )
    res.json(children)
  } catch (err) {
    next(err)
  }
})

router.get('/parents/children/:studentId/fees', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const child = await resolveOwnChild(req, req.params.studentId)
    if (!child) return res.status(403).json({ detail: 'Not your child' })

    const records = await FeeRecord.findAll({ where: { studentId: child.id }, order: [['id', 'DESC']] })
    const result = await Promise.all(
      records.map(async (r) => {
        const structure = await FeeStructure.findByPk(r.feeStructureId)
        return {
          id: String(r.id),
          feeType: structure?.feeType ?? 'School Fee',
          title: structure?.title ?? '',
          amount: Number(r.amount),
          paidAmount: Number(r.paidAmount),
          status: r.status,
          dueDateStart: structure?.dueDateStart ?? null,
          dueDateEnd: structure?.dueDateEnd ?? null,
        }
      })
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.get('/parents/children/:studentId/items', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const child = await resolveOwnChild(req, req.params.studentId)
    if (!child) return res.status(403).json({ detail: 'Not your child' })

    const records = await ItemRecord.findAll({ where: { studentId: child.id }, order: [['id', 'DESC']] })
    res.json(records.map((r) => ({ id: String(r.id), item: r.itemName, quantity: r.quantity, issuedDate: r.issuedDate })))
  } catch (err) {
    next(err)
  }
})

router.get('/parents/children/:studentId/receipts', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const child = await resolveOwnChild(req, req.params.studentId)
    if (!child) return res.status(403).json({ detail: 'Not your child' })

    const transactions = await Transaction.findAll({ where: { studentId: child.id }, order: [['id', 'DESC']] })
    res.json(
      transactions.map((t) => ({
        id: String(t.id),
        receiptNumber: t.receiptNumber,
        amount: Number(t.amount),
        paymentDate: t.paymentDate,
        type: t.type,
        paymentMode: t.paymentMode,
        proofImageUrl: proofImageUrl(t.proofImagePath),
      }))
    )
  } catch (err) {
    next(err)
  }
})

router.get('/parents/children/:studentId/marks', requireAuth, requireRole('parent'), async (req: AuthedRequest, res, next) => {
  try {
    const child = await resolveOwnChild(req, req.params.studentId)
    if (!child) return res.status(403).json({ detail: 'Not your child' })

    const records = await StudentSubjectMarks.findAll({ where: { studentId: child.id }, order: [['id', 'DESC']] })
    const result = await Promise.all(
      records.map(async (r) => {
        const subject = await Subject.findByPk(r.subjectId)
        return {
          id: String(r.id),
          subject: subject?.subjectName ?? '',
          examType: r.examType,
          marks: Number(r.marks),
          note: r.note,
        }
      })
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

export default router
