import { Router } from 'express'
import { Op } from 'sequelize'
import { User } from '../models/User'
import { Subject } from '../models/Subject'
import { TeacherSubject } from '../models/TeacherSubject'
import { StudentSubject } from '../models/StudentSubject'
import { StudentProfile } from '../models/StudentProfile'
import { ClassSection } from '../models/ClassSection'
import { Grade } from '../models/Grade'
import { TeacherProfile } from '../models/TeacherProfile'
import { requireAuth, requireRole, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'
import { displayIdForRole } from '../utils/displayId'

const router = Router()

// GET /teachers/my-subjects — current teacher's assigned subjects, with subject_name.
router.get('/teachers/my-subjects', requireAuth, requireRole('teacher'), async (req: AuthedRequest, res, next) => {
  try {
    const links = await TeacherSubject.findAll({ where: { teacherId: req.user!.sub }, order: [['id', 'DESC']] })
    const subjects = await Subject.findAll({ where: { id: { [Op.in]: links.map((l) => l.subjectId) } } })
    const byId = new Map(subjects.map((s) => [s.id, s.subjectName]))
    res.json(
      links.map((l) => ({
        id: String(l.id),
        teacher_id: String(l.teacherId),
        subject_id: String(l.subjectId),
        subject_name: byId.get(l.subjectId) ?? '',
      }))
    )
  } catch (err) {
    next(err)
  }
})

// GET /teachers/student-roster — generic {student_id,name,email} list of all students.
router.get('/teachers/student-roster', requireAuth, requireRole('teacher'), async (_req, res, next) => {
  try {
    const students = await User.findAll({ where: { role: 'Student' }, order: [['id', 'DESC']] })
    res.json(students.map((s) => ({ student_id: s.id, name: s.name, email: s.email })))
  } catch (err) {
    next(err)
  }
})

// GET /teachers/my-class — the class(es) where the current teacher is the class teacher.
router.get('/teachers/my-class', requireAuth, requireRole('teacher'), async (req: AuthedRequest, res, next) => {
  try {
    const sections = await ClassSection.findAll({ where: { classTeacherId: req.user!.sub }, order: [['id', 'DESC']] })
    const result = await Promise.all(
      sections.map(async (c) => {
        const [grade, studentCount] = await Promise.all([
          Grade.findByPk(c.gradeId),
          StudentProfile.count({ where: { classSectionId: c.id } }),
        ])
        return {
          id: String(c.id),
          gradeName: grade?.name ?? '',
          name: c.name,
          fullName: `${grade?.name ?? ''}${c.name}`,
          studentCount,
        }
      })
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// GET /teachers/my-teaching-classes — for the current teacher, the classes their students
// belong to, grouped with which of the teacher's subjects are taught in each class.
router.get('/teachers/my-teaching-classes', requireAuth, requireRole('teacher'), async (req: AuthedRequest, res, next) => {
  try {
    const teacherSubjectLinks = await TeacherSubject.findAll({ where: { teacherId: req.user!.sub } })
    const subjectIds = teacherSubjectLinks.map((l) => l.subjectId)
    if (subjectIds.length === 0) return res.json([])

    const subjects = await Subject.findAll({ where: { id: { [Op.in]: subjectIds } } })
    const subjectNameById = new Map(subjects.map((s) => [s.id, s.subjectName]))

    const studentSubjectLinks = await StudentSubject.findAll({ where: { subjectId: { [Op.in]: subjectIds } } })
    const studentIds = Array.from(new Set(studentSubjectLinks.map((l) => l.studentId)))
    const profiles = studentIds.length
      ? await StudentProfile.findAll({ where: { userId: { [Op.in]: studentIds }, classSectionId: { [Op.ne]: null } } })
      : []
    const classSectionIdByStudentId = new Map(profiles.map((p) => [p.userId, p.classSectionId as number]))

    // classSectionId -> Set(subjectId)
    const classSubjectMap = new Map<number, Set<number>>()
    for (const link of studentSubjectLinks) {
      const classSectionId = classSectionIdByStudentId.get(link.studentId)
      if (classSectionId == null) continue
      if (!classSubjectMap.has(classSectionId)) classSubjectMap.set(classSectionId, new Set())
      classSubjectMap.get(classSectionId)!.add(link.subjectId)
    }

    const classSectionIds = Array.from(classSubjectMap.keys())
    const classSections = classSectionIds.length
      ? await ClassSection.findAll({ where: { id: { [Op.in]: classSectionIds } } })
      : []
    const grades = await Grade.findAll({ where: { id: { [Op.in]: classSections.map((c) => c.gradeId) } } })
    const gradeNameById = new Map(grades.map((g) => [g.id, g.name]))

    const result = classSections.map((c) => {
      const subjectIdsForClass = Array.from(classSubjectMap.get(c.id) ?? [])
      const studentCount = profiles.filter((p) => p.classSectionId === c.id).length
      return {
        classId: String(c.id),
        className: `${gradeNameById.get(c.gradeId) ?? ''}${c.name}`,
        studentCount,
        subjects: subjectIdsForClass.map((sid) => ({ subjectId: String(sid), subjectName: subjectNameById.get(sid) ?? '' })),
      }
    })
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// ---- Teacher self-service profile ----

router.get('/users/teacher/profile', requireAuth, requireRole('teacher'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const [profile, links] = await Promise.all([
      TeacherProfile.findOne({ where: { userId: user.id } }),
      TeacherSubject.findAll({ where: { teacherId: user.id } }),
    ])
    const subjects = links.length
      ? await Subject.findAll({ where: { id: { [Op.in]: links.map((l) => l.subjectId) } } })
      : []
    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone ?? null,
      teacherId: profile?.employeeCode ?? '',
      department: profile?.department ?? '',
      subjects: subjects.map((s) => s.subjectName),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/users/teacher/profile', requireAuth, requireRole('teacher'), async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const { fullName, phone, department } = req.body as {
      fullName?: string
      phone?: string | null
      department?: string
    }
    if (fullName?.trim()) user.name = fullName.trim()
    if (phone !== undefined) user.phone = phone
    await user.save()
    const [profile] = await TeacherProfile.findOrCreate({ where: { userId: user.id } })
    if (department !== undefined) profile.department = department
    await profile.save()

    const links = await TeacherSubject.findAll({ where: { teacherId: user.id } })
    const subjects = links.length
      ? await Subject.findAll({ where: { id: { [Op.in]: links.map((l) => l.subjectId) } } })
      : []
    res.json({
      fullName: user.name,
      email: user.email,
      phone: user.phone,
      teacherId: profile.employeeCode ?? '',
      department: profile.department ?? '',
      subjects: subjects.map((s) => s.subjectName),
    })
  } catch (err) {
    next(err)
  }
})

// ---- Teacher extended details (viewed/edited by admin, or self via saveTeacherDetails) ----

async function serializeTeacherDetail(user: User) {
  const profile = await TeacherProfile.findOne({ where: { userId: user.id } })
  return {
    email: user.email,
    employeeId: profile?.employeeCode ?? '',
    department: profile?.department ?? '',
    qualification: profile?.qualification ?? '',
    subjectSpecialization: profile?.subjectSpecialization ?? '',
    joiningDate: profile?.joiningDate ?? null,
    joinedDate: user.joinedDate,
  }
}

router.get('/admin/teachers/:email/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { email: req.params.email, role: 'Teacher' } })
    if (!user) return res.status(404).json({ detail: 'Teacher not found' })
    res.json(await serializeTeacherDetail(user))
  } catch (err) {
    next(err)
  }
})

router.post('/users/teachers/details', requireAuth, requireAdminOrStaffFor('User Management'), async (req, res, next) => {
  try {
    const { email, department, qualification, subjectSpecialization, joiningDate } = req.body as {
      email?: string
      department?: string
      qualification?: string
      subjectSpecialization?: string
      joiningDate?: string
    }
    if (!email) return res.status(400).json({ detail: 'email is required' })
    const user = await User.findOne({ where: { email, role: 'Teacher' } })
    if (!user) return res.status(404).json({ detail: 'Teacher not found' })
    const [profile] = await TeacherProfile.findOrCreate({ where: { userId: user.id } })
    if (!profile.employeeCode) profile.employeeCode = displayIdForRole('Teacher', user.id)
    if (department !== undefined) profile.department = department
    if (qualification !== undefined) profile.qualification = qualification
    if (subjectSpecialization !== undefined) profile.subjectSpecialization = subjectSpecialization
    if (joiningDate !== undefined) profile.joiningDate = joiningDate
    await profile.save()
    res.json(await serializeTeacherDetail(user))
  } catch (err) {
    next(err)
  }
})

export default router
