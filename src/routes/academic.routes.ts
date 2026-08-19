import { Router } from 'express'
import { Op } from 'sequelize'
import { AcademicYear } from '../models/AcademicYear'
import { Term, TermName } from '../models/Term'
import { Grade } from '../models/Grade'
import { ClassSection } from '../models/ClassSection'
import { User } from '../models/User'
import { StudentProfile } from '../models/StudentProfile'
import { StudentSubject } from '../models/StudentSubject'
import { TeacherSubject } from '../models/TeacherSubject'
import { Subject } from '../models/Subject'
import { StudentSubjectMarks } from '../models/StudentSubjectMarks'
import { requireAuth, requireAdminOrStaffFor, AuthedRequest } from '../middleware/auth'
import { RolePermission } from '../models/RolePermission'

const router = Router()

// ---- Academic years ----

router.get('/academic/years', requireAuth, async (_req, res, next) => {
  try {
    const years = await AcademicYear.findAll({ order: [['year', 'DESC']] })
    res.json(years.map((y) => ({ id: String(y.id), year: y.year, isCurrent: y.isCurrent, startDate: y.startDate, endDate: y.endDate })))
  } catch (err) {
    next(err)
  }
})

router.post('/academic/years', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const { year, startDate, endDate } = req.body as { year?: number; startDate?: string; endDate?: string }
    if (!year) return res.status(400).json({ detail: 'year is required' })
    await AcademicYear.create({ year, startDate: startDate || null, endDate: endDate || null })
    const years = await AcademicYear.findAll({ order: [['year', 'DESC']] })
    res.status(201).json(years.map((y) => ({ id: String(y.id), year: y.year, isCurrent: y.isCurrent })))
  } catch (err) {
    next(err)
  }
})

/** Marks one academic year as current, unmarking all others. */
router.put('/academic/years/:id/set-current', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const year = await AcademicYear.findByPk(req.params.id)
    if (!year) return res.status(404).json({ detail: 'Academic year not found' })
    await AcademicYear.update({ isCurrent: false }, { where: {} })
    year.isCurrent = true
    await year.save()
    res.json({ id: String(year.id), year: year.year, isCurrent: true })
  } catch (err) {
    next(err)
  }
})

// ---- Terms ----

router.get('/academic/terms', requireAuth, async (req, res, next) => {
  try {
    const { academicYearId } = req.query as { academicYearId?: string }
    const terms = await Term.findAll({ where: academicYearId ? { academicYearId } : undefined, order: [['id', 'DESC']] })
    res.json(terms.map((t) => ({ id: String(t.id), academicYearId: String(t.academicYearId), name: t.name, startDate: t.startDate, endDate: t.endDate })))
  } catch (err) {
    next(err)
  }
})

router.post('/academic/terms', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const { academicYearId, name, startDate, endDate } = req.body as {
      academicYearId?: string
      name?: TermName
      startDate?: string
      endDate?: string
    }
    if (!academicYearId || !name) return res.status(400).json({ detail: 'academicYearId and name are required' })
    await Term.create({ academicYearId: Number(academicYearId), name, startDate: startDate || null, endDate: endDate || null })
    const terms = await Term.findAll({ where: { academicYearId }, order: [['id', 'DESC']] })
    res.status(201).json(terms.map((t) => ({ id: String(t.id), name: t.name })))
  } catch (err) {
    next(err)
  }
})

// ---- Grades ----

router.get('/academic/grades', requireAuth, async (_req, res, next) => {
  try {
    const grades = await Grade.findAll({ order: [['order', 'ASC']] })
    res.json(grades.map((g) => ({ id: String(g.id), name: g.name, order: g.order })))
  } catch (err) {
    next(err)
  }
})

router.post('/academic/grades', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const { name, order } = req.body as { name?: string; order?: number }
    if (!name?.trim()) return res.status(400).json({ detail: 'name is required' })
    const existing = await Grade.findOne({ where: { name: name.trim() } })
    if (existing) return res.status(409).json({ detail: `A grade named "${name.trim()}" already exists` })
    const nextOrder = order ?? ((await Grade.max('order')) as number | null ?? 0) + 1
    await Grade.create({ name: name.trim(), order: nextOrder })
    const grades = await Grade.findAll({ order: [['order', 'ASC']] })
    res.status(201).json(grades.map((g) => ({ id: String(g.id), name: g.name, order: g.order })))
  } catch (err) {
    next(err)
  }
})

router.put('/academic/grades/:id', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const grade = await Grade.findByPk(req.params.id)
    if (!grade) return res.status(404).json({ detail: 'Grade not found' })
    const { name, order } = req.body as { name?: string; order?: number }
    if (name?.trim()) {
      const existing = await Grade.findOne({ where: { name: name.trim() } })
      if (existing && existing.id !== grade.id) return res.status(409).json({ detail: `A grade named "${name.trim()}" already exists` })
      grade.name = name.trim()
    }
    if (order != null) grade.order = order
    await grade.save()
    const grades = await Grade.findAll({ order: [['order', 'ASC']] })
    res.json(grades.map((g) => ({ id: String(g.id), name: g.name, order: g.order })))
  } catch (err) {
    next(err)
  }
})

router.delete('/academic/grades/:id', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const grade = await Grade.findByPk(req.params.id)
    if (!grade) return res.status(404).json({ detail: 'Grade not found' })
    const sectionCount = await ClassSection.count({ where: { gradeId: grade.id } })
    if (sectionCount > 0) {
      return res.status(409).json({ detail: 'Cannot delete a grade that still has divisions. Delete its divisions first.' })
    }
    await grade.destroy()
    const grades = await Grade.findAll({ order: [['order', 'ASC']] })
    res.json(grades.map((g) => ({ id: String(g.id), name: g.name, order: g.order })))
  } catch (err) {
    next(err)
  }
})

// ---- Class sections ----

router.get('/academic/classes', requireAuth, async (req, res, next) => {
  try {
    const { gradeId, academicYearId } = req.query as { gradeId?: string; academicYearId?: string }
    const where: Record<string, unknown> = {}
    if (gradeId) where.gradeId = gradeId
    if (academicYearId) where.academicYearId = academicYearId

    const classes = await ClassSection.findAll({ where, order: [['id', 'DESC']] })
    const result = await Promise.all(
      classes.map(async (c) => {
        const [grade, teacher] = await Promise.all([
          Grade.findByPk(c.gradeId),
          c.classTeacherId ? User.findByPk(c.classTeacherId) : null,
        ])
        return {
          id: String(c.id),
          gradeId: String(c.gradeId),
          gradeName: grade?.name ?? '',
          academicYearId: String(c.academicYearId),
          name: c.name,
          fullName: `${grade?.name ?? ''}${c.name}`,
          classTeacherId: c.classTeacherId != null ? String(c.classTeacherId) : null,
          classTeacherName: teacher?.name ?? null,
        }
      })
    )
    res.json(result)
  } catch (err) {
    next(err)
  }
})

router.post('/academic/classes', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const { gradeId, academicYearId, name, classTeacherId } = req.body as {
      gradeId?: string
      academicYearId?: string
      name?: string
      classTeacherId?: string
    }
    if (!gradeId || !academicYearId) {
      return res.status(400).json({ detail: 'gradeId and academicYearId are required' })
    }
    // name is optional — a grade with only one class doesn't need a division name of its own.
    await ClassSection.create({
      gradeId: Number(gradeId),
      academicYearId: Number(academicYearId),
      name: name?.trim() ?? '',
      classTeacherId: classTeacherId ? Number(classTeacherId) : null,
    })
    const classes = await ClassSection.findAll({ where: { gradeId }, order: [['id', 'DESC']] })
    res.status(201).json(classes.map((c) => ({ id: String(c.id), name: c.name })))
  } catch (err) {
    next(err)
  }
})

router.put('/academic/classes/:id', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const classSection = await ClassSection.findByPk(req.params.id)
    if (!classSection) return res.status(404).json({ detail: 'Class not found' })
    const { name, classTeacherId } = req.body as { name?: string; classTeacherId?: string | null }
    if (name?.trim()) classSection.name = name.trim()
    if (classTeacherId !== undefined) classSection.classTeacherId = classTeacherId ? Number(classTeacherId) : null
    await classSection.save()
    const classes = await ClassSection.findAll({ where: { gradeId: classSection.gradeId }, order: [['id', 'DESC']] })
    res.json(classes.map((c) => ({ id: String(c.id), name: c.name })))
  } catch (err) {
    next(err)
  }
})

router.delete('/academic/classes/:id', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const classSection = await ClassSection.findByPk(req.params.id)
    if (!classSection) return res.status(404).json({ detail: 'Class not found' })
    const studentCount = await StudentProfile.count({ where: { classSectionId: classSection.id } })
    if (studentCount > 0) {
      return res.status(409).json({ detail: 'Cannot delete a division that still has students assigned to it.' })
    }
    const gradeId = classSection.gradeId
    await classSection.destroy()
    const classes = await ClassSection.findAll({ where: { gradeId }, order: [['id', 'DESC']] })
    res.json(classes.map((c) => ({ id: String(c.id), name: c.name })))
  } catch (err) {
    next(err)
  }
})

/**
 * POST /academic/classes/:id/subjects — bulk-enroll every student currently in this
 * division into a subject (creates one StudentSubject row per student, skipping students
 * already enrolled). This is how a subject "shows up" on a class's Subjects & Teachers list.
 */
router.post('/academic/classes/:id/subjects', requireAuth, requireAdminOrStaffFor('Class Details'), async (req, res, next) => {
  try {
    const classSection = await ClassSection.findByPk(req.params.id)
    if (!classSection) return res.status(404).json({ detail: 'Class not found' })

    const { subjectId } = req.body as { subjectId?: string }
    if (!subjectId) return res.status(400).json({ detail: 'subjectId is required' })
    const subject = await Subject.findByPk(subjectId)
    if (!subject) return res.status(404).json({ detail: 'Subject not found' })

    const profiles = await StudentProfile.findAll({ where: { classSectionId: classSection.id } })
    let added = 0
    for (const profile of profiles) {
      const [, created] = await StudentSubject.findOrCreate({
        where: { studentId: profile.userId, subjectId: Number(subjectId) },
      })
      if (created) added++
    }

    res.status(201).json({ studentsInClass: profiles.length, added })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /academic/classes/:id/details — everything the Class Details admin page needs
 * in one call: class info, student count, and which subjects this class's students
 * take along with who teaches each one.
 */
// Admins can view any class's details. A teacher may also view this for a class where
// they are the class teacher (used by the teacher-side "My Class" page).
router.get('/academic/classes/:id/details', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const classSectionId = Number(req.params.id)
    const classSection = await ClassSection.findByPk(classSectionId)
    if (!classSection) return res.status(404).json({ detail: 'Class not found' })

    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin'
    const isOwnClassTeacher = req.user!.role === 'teacher' && classSection.classTeacherId === req.user!.sub
    let isStaffWithAccess = false
    if (req.user!.role === 'staff') {
      const row = await RolePermission.findOne({ where: { role: 'staff', pageKey: 'Class Details' } })
      isStaffWithAccess = !!row?.allowed
    }
    if (!isAdmin && !isOwnClassTeacher && !isStaffWithAccess) {
      return res.status(403).json({ detail: 'Insufficient permissions' })
    }

    const [grade, classTeacher, profiles] = await Promise.all([
      Grade.findByPk(classSection.gradeId),
      classSection.classTeacherId ? User.findByPk(classSection.classTeacherId) : null,
      StudentProfile.findAll({ where: { classSectionId } }),
    ])

    const studentIds = profiles.map((p) => p.userId)
    const studentSubjectLinks = studentIds.length
      ? await StudentSubject.findAll({ where: { studentId: { [Op.in]: studentIds } } })
      : []
    const subjectIds = Array.from(new Set(studentSubjectLinks.map((l) => l.subjectId)))

    const [subjects, teacherLinks] = await Promise.all([
      subjectIds.length ? Subject.findAll({ where: { id: { [Op.in]: subjectIds } } }) : Promise.resolve([]),
      subjectIds.length ? TeacherSubject.findAll({ where: { subjectId: { [Op.in]: subjectIds } } }) : Promise.resolve([]),
    ])
    const teacherIds = Array.from(new Set(teacherLinks.map((l) => l.teacherId)))
    const teachers = teacherIds.length ? await User.findAll({ where: { id: { [Op.in]: teacherIds } } }) : []

    const subjectsWithTeachers = subjects.map((s) => ({
      subjectId: String(s.id),
      subjectName: s.subjectName,
      teachers: teacherLinks
        .filter((l) => l.subjectId === s.id)
        .map((l) => teachers.find((t) => t.id === l.teacherId)?.name)
        .filter((name): name is string => !!name),
    }))

    const students = studentIds.length ? await User.findAll({ where: { id: { [Op.in]: studentIds } }, order: [['id', 'DESC']] }) : []
    const marksRows = studentIds.length
      ? await StudentSubjectMarks.findAll({ where: { studentId: { [Op.in]: studentIds } }, order: [['id', 'DESC']] })
      : []
    const subjectById = new Map(subjects.map((s) => [s.id, s.subjectName]))
    const studentById = new Map(students.map((s) => [s.id, s.name]))
    const marks = marksRows.map((m) => ({
      id: String(m.id),
      studentId: String(m.studentId),
      studentName: studentById.get(m.studentId) ?? '',
      subjectId: String(m.subjectId),
      subjectName: subjectById.get(m.subjectId) ?? '',
      examType: m.examType,
      marks: m.marks,
      note: m.note,
    }))

    res.json({
      classInfo: {
        id: String(classSection.id),
        name: classSection.name,
        gradeName: grade?.name ?? '',
        fullName: `${grade?.name ?? ''}${classSection.name}`,
        classTeacherName: classTeacher?.name ?? null,
      },
      studentCount: studentIds.length,
      students: students.map((s) => ({ id: String(s.id), name: s.name, email: s.email })),
      subjectsWithTeachers,
      marks,
    })
  } catch (err) {
    next(err)
  }
})

export default router
