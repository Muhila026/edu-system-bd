import { Router } from 'express'
import { AfterSchoolClass, AfterSchoolClassName, AfterSchoolClassLevel } from '../models/AfterSchoolClass'
import { ClassEnrollment, EnrollmentStatus } from '../models/ClassEnrollment'
import { User } from '../models/User'
import { Transaction } from '../models/Transaction'
import { requireAuth, requireRole, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'

const router = Router()

function serializeClass(c: AfterSchoolClass) {
  return {
    id: String(c.id),
    name: c.name,
    description: c.description,
    schedule: c.schedule,
    level: c.level,
    admissionFee: Number(c.admissionFee),
  }
}

async function serializeEnrollment(e: ClassEnrollment) {
  const [cls, student] = await Promise.all([AfterSchoolClass.findByPk(e.classId), User.findByPk(e.studentId)])
  const targetFee = cls ? Number(cls.totalFee ?? cls.admissionFee) : 0
  return {
    id: String(e.id),
    classId: String(e.classId),
    className: cls?.name ?? '',
    studentId: String(e.studentId),
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    enrolledDate: e.enrolledDate,
    status: e.status,
    amountPaid: Number(e.amountPaid),
    targetFee,
    outstanding: Math.max(0, targetFee - Number(e.amountPaid)),
  }
}

async function serializeEnrollments(list: ClassEnrollment[]) {
  return Promise.all(list.map(serializeEnrollment))
}

// ---- Classes ----

router.get('/after-school-classes', requireAuth, async (_req, res, next) => {
  try {
    const classes = await AfterSchoolClass.findAll({ order: [['id', 'DESC']] })
    res.json(classes.map(serializeClass))
  } catch (err) {
    next(err)
  }
})

router.post('/after-school-classes', requireAuth, requireAdminOrStaffFor(['Subjects', 'Class Details']), async (req, res, next) => {
  try {
    const { name, description, schedule, level, admissionFee } = req.body as {
      name?: AfterSchoolClassName
      description?: string
      schedule?: string
      level?: AfterSchoolClassLevel
      admissionFee?: number
    }
    if (!name?.trim() || admissionFee == null) return res.status(400).json({ detail: 'name and admissionFee are required' })
    await AfterSchoolClass.create({
      name: name.trim(),
      description: description?.trim() || null,
      schedule: schedule?.trim() || null,
      level: level || 'All',
      admissionFee,
    })
    const classes = await AfterSchoolClass.findAll({ order: [['id', 'DESC']] })
    res.status(201).json(classes.map(serializeClass))
  } catch (err) {
    next(err)
  }
})

router.put('/after-school-classes/:id', requireAuth, requireAdminOrStaffFor(['Subjects', 'Class Details']), async (req, res, next) => {
  try {
    const cls = await AfterSchoolClass.findByPk(req.params.id)
    if (!cls) return res.status(404).json({ detail: 'Class not found' })
    const { name, description, schedule, level, admissionFee } = req.body as {
      name?: AfterSchoolClassName
      description?: string
      schedule?: string
      level?: AfterSchoolClassLevel
      admissionFee?: number
    }
    if (name?.trim()) cls.name = name.trim()
    if (description !== undefined) cls.description = description?.trim() || null
    if (schedule !== undefined) cls.schedule = schedule?.trim() || null
    if (level) cls.level = level
    if (admissionFee != null) cls.admissionFee = admissionFee
    await cls.save()
    const classes = await AfterSchoolClass.findAll({ order: [['id', 'DESC']] })
    res.json(classes.map(serializeClass))
  } catch (err) {
    next(err)
  }
})

router.delete('/after-school-classes/:id', requireAuth, requireAdminOrStaffFor(['Subjects', 'Class Details']), async (req, res, next) => {
  try {
    const cls = await AfterSchoolClass.findByPk(req.params.id)
    if (!cls) return res.status(404).json({ detail: 'Class not found' })
    await ClassEnrollment.destroy({ where: { classId: cls.id } })
    await cls.destroy()
    const classes = await AfterSchoolClass.findAll({ order: [['id', 'DESC']] })
    res.json(classes.map(serializeClass))
  } catch (err) {
    next(err)
  }
})

// ---- Enrollments ----

router.get('/after-school-classes/enrollments', requireAuth, requireRole('admin', 'super_admin', 'teacher'), async (req, res, next) => {
  try {
    const { classId } = req.query as { classId?: string }
    const enrollments = await ClassEnrollment.findAll({
      where: classId ? { classId } : undefined,
      order: [['id', 'DESC']],
    })
    res.json(await serializeEnrollments(enrollments))
  } catch (err) {
    next(err)
  }
})

router.get('/after-school-classes/enrollments/me', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const enrollments = await ClassEnrollment.findAll({ where: { studentId: req.user!.sub }, order: [['id', 'DESC']] })
    res.json(await serializeEnrollments(enrollments))
  } catch (err) {
    next(err)
  }
})

router.post('/after-school-classes/:id/enroll', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const cls = await AfterSchoolClass.findByPk(req.params.id)
    if (!cls) return res.status(404).json({ detail: 'Class not found' })
    const studentId = req.user!.sub

    const already = await ClassEnrollment.findOne({ where: { classId: cls.id, studentId } })
    if (already) {
      const enrollments = await ClassEnrollment.findAll({ where: { studentId }, order: [['id', 'DESC']] })
      return res.json(await serializeEnrollments(enrollments))
    }

    await ClassEnrollment.create({
      classId: cls.id,
      studentId,
      enrolledDate: new Date().toISOString().slice(0, 10),
    })
    const enrollments = await ClassEnrollment.findAll({ where: { studentId }, order: [['id', 'DESC']] })
    res.status(201).json(await serializeEnrollments(enrollments))
  } catch (err) {
    next(err)
  }
})

router.put('/after-school-classes/enrollments/:id/status', requireAuth, requireAdminOrStaffFor(['Subjects', 'Class Details']), async (req, res, next) => {
  try {
    const enrollment = await ClassEnrollment.findByPk(req.params.id)
    if (!enrollment) return res.status(404).json({ detail: 'Enrollment not found' })
    const { status } = req.body as { status?: EnrollmentStatus }
    if (!status || !['Active', 'Pending', 'Completed'].includes(status)) {
      return res.status(400).json({ detail: 'Invalid status' })
    }
    enrollment.status = status
    await enrollment.save()
    const enrollments = await ClassEnrollment.findAll({ order: [['id', 'DESC']] })
    res.json(await serializeEnrollments(enrollments))
  } catch (err) {
    next(err)
  }
})

export default router
