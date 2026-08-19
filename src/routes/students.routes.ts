import { Router } from 'express'
import { User } from '../models/User'
import { StudentProfile, GradeLevel, Gender } from '../models/StudentProfile'
import { Grade } from '../models/Grade'
import { ClassSection } from '../models/ClassSection'
import { TeacherSubject } from '../models/TeacherSubject'
import { StudentSubject } from '../models/StudentSubject'
import { Subject } from '../models/Subject'
import { ParentChildLink } from '../models/ParentChildLink'
import { hashPassword } from '../utils/password'
import { requireAuth, requireAdminOrStaffFor, requireRole, AuthedRequest } from '../middleware/auth'
import { displayIdForRole } from '../utils/displayId'

const router = Router()

async function serialize(user: User, profile: StudentProfile | null) {
  const [grade, classSection] = await Promise.all([
    profile?.gradeId ? Grade.findByPk(profile.gradeId) : null,
    profile?.classSectionId ? ClassSection.findByPk(profile.classSectionId) : null,
  ])
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    joinedDate: user.joinedDate,
    gradeLevel: profile?.gradeLevel ?? null,
    gradeId: profile?.gradeId != null ? String(profile.gradeId) : null,
    gradeName: grade?.name ?? null,
    classSectionId: profile?.classSectionId != null ? String(profile.classSectionId) : null,
    className: classSection ? `${grade?.name ?? ''}${classSection.name}` : null,
    admissionDate: profile?.admissionDate ?? null,
  }
}

/**
 * POST /students/register — Admin/Super Admin enrollment workflow.
 * Creates the login account (User, role=Student) and the academic profile
 * (StudentProfile: grade level, DOB, gender, grade/class assignment) in a single call.
 */
router.post('/students/register', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const {
      name,
      email,
      password,
      gradeLevel,
      dateOfBirth,
      gender,
      gradeId,
      classSectionId,
    } = req.body as {
      name?: string
      email?: string
      password?: string
      gradeLevel?: GradeLevel
      dateOfBirth?: string
      gender?: Gender
      gradeId?: string
      classSectionId?: string
    }

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ detail: 'name, email and password are required' })
    }
    if (password.length < 6) {
      return res.status(400).json({ detail: 'Password must be at least 6 characters' })
    }

    const emailNormalized = email.trim().toLowerCase()
    const existing = await User.findOne({ where: { email: emailNormalized } })
    if (existing) {
      return res.status(409).json({ detail: 'A user with this email already exists' })
    }

    const user = await User.create({
      name: name.trim(),
      email: emailNormalized,
      passwordHash: await hashPassword(password),
      role: 'Student',
      status: 'Active',
      joinedDate: new Date().toISOString().slice(0, 10),
    })

    const profile = await StudentProfile.create({
      userId: user.id,
      gradeLevel: gradeLevel && ['Primary', 'Secondary', 'O/L', 'A/L'].includes(gradeLevel) ? gradeLevel : 'Primary',
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      gradeId: gradeId ? Number(gradeId) : null,
      classSectionId: classSectionId ? Number(classSectionId) : null,
      admissionDate: new Date().toISOString().slice(0, 10),
      studentCode: displayIdForRole('Student', user.id),
    })

    res.status(201).json(await serialize(user, profile))
  } catch (err) {
    next(err)
  }
})

/**
 * PUT /students/:id/assign-class — put a student into a class division (or take them out
 * with classSectionId: null). Also syncs gradeId to the division's grade so the two never
 * disagree.
 */
router.put('/students/:id/assign-class', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, role: 'Student' } })
    if (!user) return res.status(404).json({ detail: 'Student not found' })

    const { classSectionId } = req.body as { classSectionId?: string | null }
    let gradeId: number | null = null
    if (classSectionId) {
      const classSection = await ClassSection.findByPk(classSectionId)
      if (!classSection) return res.status(404).json({ detail: 'Class division not found' })
      gradeId = classSection.gradeId
    }

    const [profile] = await StudentProfile.findOrCreate({ where: { userId: user.id } })
    profile.classSectionId = classSectionId ? Number(classSectionId) : null
    profile.gradeId = gradeId
    await profile.save()

    res.json(await serialize(user, profile))
  } catch (err) {
    next(err)
  }
})

/** GET /students/:id/profile — enrollment + academic profile details. */
router.get('/students/:id/profile', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { id: req.params.id, role: 'Student' } })
    if (!user) return res.status(404).json({ detail: 'Student not found' })
    const profile = await StudentProfile.findOne({ where: { userId: user.id } })
    res.json(await serialize(user, profile))
  } catch (err) {
    next(err)
  }
})

// ---- Student self-service profile ----

router.get('/users/student/profile', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const profile = await StudentProfile.findOne({ where: { userId: user.id } })
    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone ?? null,
      studentId: profile?.studentCode ?? '',
      major: profile?.program ?? '',
      year: profile?.batch ?? '',
      gpa: profile?.gpa ?? '',
      address: profile?.address ?? '',
    })
  } catch (err) {
    next(err)
  }
})

router.post('/users/student/profile', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const { fullName, phone, major, year, gpa, address } = req.body as {
      fullName?: string
      phone?: string | null
      studentId?: string
      major?: string
      year?: string
      gpa?: string
      address?: string
    }
    if (fullName?.trim()) user.name = fullName.trim()
    if (phone !== undefined) user.phone = phone
    await user.save()
    const [profile] = await StudentProfile.findOrCreate({ where: { userId: user.id } })
    if (major !== undefined) profile.program = major
    if (year !== undefined) profile.batch = year
    if (gpa !== undefined) profile.gpa = gpa
    if (address !== undefined) profile.address = address
    await profile.save()
    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone,
      studentId: profile.studentCode ?? '',
      major: profile.program ?? '',
      year: profile.batch ?? '',
      gpa: profile.gpa ?? '',
      address: profile.address ?? '',
    })
  } catch (err) {
    next(err)
  }
})

// ---- Student extended details (viewed by admin or teacher) ----

async function serializeStudentDetail(user: User) {
  const [profile, link] = await Promise.all([
    StudentProfile.findOne({ where: { userId: user.id } }),
    ParentChildLink.findOne({ where: { studentUserId: user.id } }),
  ])
  const parentUser = link ? await User.findByPk(link.parentUserId) : null
  return {
    email: user.email,
    name: user.name,
    studentId: profile?.studentCode ?? '',
    gradeLevel: profile?.gradeLevel ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    gender: profile?.gender ?? null,
    batch: profile?.batch ?? '',
    program: profile?.program ?? '',
    currentSemester: profile?.currentSemester ?? 1,
    guardianName: parentUser?.name ?? undefined,
    guardianRelationship: link?.relationship ?? undefined,
    contactNumber: user.phone ?? parentUser?.phone ?? undefined,
    address: profile?.address ?? undefined,
    admissionDate: profile?.admissionDate ?? undefined,
  }
}

router.get('/admin/students/:email/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.params.email, role: 'Student' } })
    if (!user) return res.status(404).json({ detail: 'Student not found' })
    res.json(await serializeStudentDetail(user))
  } catch (err) {
    next(err)
  }
})

router.get('/users/students/details/:email', requireAuth, requireRole('teacher', 'admin', 'super_admin'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.params.email, role: 'Student' } })
    if (!user) return res.status(404).json({ detail: 'Student not found' })
    res.json(await serializeStudentDetail(user))
  } catch (err) {
    next(err)
  }
})

router.post('/admin/students/:email/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const { gradeLevel, dateOfBirth, gender, batch, program, currentSemester, contactNumber, address, admissionDate } = req.body as {
      gradeLevel?: GradeLevel
      dateOfBirth?: string | null
      gender?: Gender | null
      batch?: string
      program?: string
      currentSemester?: number
      contactNumber?: string
      address?: string
      admissionDate?: string
    }
    const user = await User.findOne({ where: { email: req.params.email, role: 'Student' } })
    if (!user) return res.status(404).json({ detail: 'Student not found' })
    if (contactNumber !== undefined) {
      user.phone = contactNumber
      await user.save()
    }
    const [profile] = await StudentProfile.findOrCreate({ where: { userId: user.id } })
    if (!profile.studentCode) profile.studentCode = displayIdForRole('Student', user.id)
    if (gradeLevel !== undefined) profile.gradeLevel = gradeLevel
    if (dateOfBirth !== undefined) profile.dateOfBirth = dateOfBirth
    if (gender !== undefined) profile.gender = gender
    if (batch !== undefined) profile.batch = batch
    if (program !== undefined) profile.program = program
    if (currentSemester !== undefined) profile.currentSemester = currentSemester
    if (address !== undefined) profile.address = address
    if (admissionDate !== undefined) profile.admissionDate = admissionDate
    await profile.save()
    res.json(await serializeStudentDetail(user))
  } catch (err) {
    next(err)
  }
})

export default router
