import { Router } from 'express'
import { Op } from 'sequelize'
import { Subject } from '../models/Subject'
import { StudentSubject } from '../models/StudentSubject'
import { TeacherSubject } from '../models/TeacherSubject'
import { StudentSubjectMarks, ExamType } from '../models/StudentSubjectMarks'
import { User } from '../models/User'
import { StudentProfile } from '../models/StudentProfile'
import { ClassSection } from '../models/ClassSection'
import { requireAuth, requireRole, requireAdminOrStaffFor, requireRoleOr, AuthedRequest } from '../middleware/auth'

/** True if this teacher is the class teacher of the division the student currently belongs to —
 *  a class teacher can enter marks for every subject in their class, not just ones they personally teach. */
async function isClassTeacherOfStudent(teacherId: number, studentId: number): Promise<boolean> {
  const profile = await StudentProfile.findOne({ where: { userId: studentId } })
  if (!profile?.classSectionId) return false
  const section = await ClassSection.findByPk(profile.classSectionId)
  return section?.classTeacherId === teacherId
}

const router = Router()

function serialize(subject: Subject) {
  return {
    _id: String(subject.id),
    subject_name: subject.subjectName,
    attendance_days: subject.attendanceDays,
  }
}

function serializeStudentSubject(row: StudentSubject) {
  return { _id: String(row.id), student_id: String(row.studentId), subject_id: String(row.subjectId) }
}

function serializeTeacherSubject(row: TeacherSubject) {
  return { _id: String(row.id), teacher_id: String(row.teacherId), subject_id: String(row.subjectId) }
}

function serializeMarks(row: StudentSubjectMarks) {
  return {
    _id: String(row.id),
    student_id: String(row.studentId),
    subject_id: String(row.subjectId),
    exam_type: row.examType,
    marks: row.marks,
    note: row.note,
  }
}

router.get('/schema/subjects', requireAuth, async (_req, res, next) => {
  try {
    const subjects = await Subject.findAll({ order: [['id', 'DESC']] })
    res.json(subjects.map(serialize))
  } catch (err) {
    next(err)
  }
})

router.post('/schema/subjects', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const { subject_name } = req.body as { subject_name?: string }
    if (!subject_name?.trim()) return res.status(400).json({ detail: 'subject_name is required' })
    const subject = await Subject.create({ subjectName: subject_name.trim() })
    res.status(201).json(serialize(subject))
  } catch (err) {
    next(err)
  }
})

router.put('/schema/subjects/:id', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const subject = await Subject.findByPk(req.params.id)
    if (!subject) return res.status(404).json({ detail: 'Subject not found' })
    const { subject_name, attendance_days } = req.body as { subject_name?: string; attendance_days?: number }
    if (subject_name?.trim()) subject.subjectName = subject_name.trim()
    if (attendance_days !== undefined) subject.attendanceDays = attendance_days
    await subject.save()
    res.json(serialize(subject))
  } catch (err) {
    next(err)
  }
})

router.delete('/schema/subjects/:id', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const subject = await Subject.findByPk(req.params.id)
    if (!subject) return res.status(404).json({ detail: 'Subject not found' })
    await subject.destroy()
    res.json({ message: 'Subject deleted' })
  } catch (err) {
    next(err)
  }
})

// ---- Student-subject enrollments ----

router.get('/schema/student-subjects', requireAuth, async (req, res, next) => {
  try {
    const { student_id } = req.query as { student_id?: string }
    const rows = await StudentSubject.findAll({
      where: student_id ? { studentId: Number(student_id) } : undefined,
      order: [['id', 'DESC']],
    })
    res.json(rows.map(serializeStudentSubject))
  } catch (err) {
    next(err)
  }
})

router.post('/schema/student-subjects', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const { student_id, subject_id } = req.body as { student_id?: string; subject_id?: string }
    if (!student_id || !subject_id) return res.status(400).json({ detail: 'student_id and subject_id are required' })
    const [row] = await StudentSubject.findOrCreate({
      where: { studentId: Number(student_id), subjectId: Number(subject_id) },
    })
    res.status(201).json(serializeStudentSubject(row))
  } catch (err) {
    next(err)
  }
})

router.delete('/schema/student-subjects/:id', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const row = await StudentSubject.findByPk(req.params.id)
    if (!row) return res.status(404).json({ detail: 'Record not found' })
    await row.destroy()
    res.json({ message: 'Removed' })
  } catch (err) {
    next(err)
  }
})

// ---- Teacher-subject assignments ----

router.get('/schema/teacher-subjects', requireAuth, async (req, res, next) => {
  try {
    const { teacher_id, subject_id } = req.query as { teacher_id?: string; subject_id?: string }
    const where: Record<string, unknown> = {}
    if (teacher_id) where.teacherId = Number(teacher_id)
    if (subject_id) where.subjectId = Number(subject_id)
    const rows = await TeacherSubject.findAll({ where, order: [['id', 'DESC']] })
    const teachers = rows.length
      ? await User.findAll({ where: { id: { [Op.in]: rows.map((r) => r.teacherId) } } })
      : []
    const nameById = new Map(teachers.map((t) => [t.id, t.name]))
    res.json(
      rows.map((r) => ({
        ...serializeTeacherSubject(r),
        teacher_name: nameById.get(r.teacherId) ?? '',
      }))
    )
  } catch (err) {
    next(err)
  }
})

router.post('/schema/teacher-subjects', requireAuth, requireAdminOrStaffFor(['Subjects', 'Class Details']), async (req, res, next) => {
  try {
    const { teacher_id, subject_id } = req.body as { teacher_id?: string; subject_id?: string }
    if (!teacher_id || !subject_id) return res.status(400).json({ detail: 'teacher_id and subject_id are required' })
    const [row] = await TeacherSubject.findOrCreate({
      where: { teacherId: Number(teacher_id), subjectId: Number(subject_id) },
    })
    res.status(201).json(serializeTeacherSubject(row))
  } catch (err) {
    next(err)
  }
})

router.delete('/schema/teacher-subjects/:id', requireAuth, requireAdminOrStaffFor('Subjects'), async (req, res, next) => {
  try {
    const row = await TeacherSubject.findByPk(req.params.id)
    if (!row) return res.status(404).json({ detail: 'Record not found' })
    await row.destroy()
    res.json({ message: 'Removed' })
  } catch (err) {
    next(err)
  }
})

// ---- Student-subject marks (one row per student+subject; POST upserts by that pair) ----

router.get('/schema/student-subject-marks', requireAuth, async (req, res, next) => {
  try {
    const { student_id, subject_id } = req.query as { student_id?: string; subject_id?: string }
    const where: Record<string, unknown> = {}
    if (student_id) where.studentId = Number(student_id)
    if (subject_id) where.subjectId = Number(subject_id)
    const rows = await StudentSubjectMarks.findAll({ where, order: [['id', 'DESC']] })
    res.json(rows.map(serializeMarks))
  } catch (err) {
    next(err)
  }
})

// Admins can mark any student/subject. Teachers may enter marks for subjects they are assigned
// to teach, or for any subject if they are the class teacher of that student's division — either
// way, only for students enrolled in that subject.
router.post('/schema/student-subject-marks', requireAuth, requireRoleOr('teacher', requireAdminOrStaffFor('Class Details')), async (req: AuthedRequest, res, next) => {
  try {
    const { student_id, subject_id, exam_type, marks, note } = req.body as {
      student_id?: string
      subject_id?: string
      exam_type?: ExamType
      marks?: number
      note?: string
    }
    if (!student_id || !subject_id || !exam_type) {
      return res.status(400).json({ detail: 'student_id, subject_id and exam_type are required' })
    }
    if (req.user!.role === 'teacher') {
      const teaches = await TeacherSubject.findOne({ where: { teacherId: req.user!.sub, subjectId: Number(subject_id) } })
      if (!teaches && !(await isClassTeacherOfStudent(req.user!.sub, Number(student_id)))) {
        return res.status(403).json({ detail: 'You are not assigned to teach this subject or this student\'s class' })
      }
      const enrolled = await StudentSubject.findOne({ where: { studentId: Number(student_id), subjectId: Number(subject_id) } })
      if (!enrolled) return res.status(403).json({ detail: 'This student is not enrolled in this subject' })
    }
    const [row] = await StudentSubjectMarks.findOrCreate({
      where: { studentId: Number(student_id), subjectId: Number(subject_id), examType: exam_type },
      defaults: {
        studentId: Number(student_id),
        subjectId: Number(subject_id),
        examType: exam_type,
        marks: marks ?? 0,
        note: note?.trim() || null,
      },
    })
    row.marks = marks ?? row.marks
    if (note !== undefined) row.note = note.trim() || null
    await row.save()
    res.status(201).json(serializeMarks(row))
  } catch (err) {
    next(err)
  }
})

router.delete('/schema/student-subject-marks/:id', requireAuth, requireRoleOr('teacher', requireAdminOrStaffFor('Class Details')), async (req: AuthedRequest, res, next) => {
  try {
    const row = await StudentSubjectMarks.findByPk(req.params.id)
    if (!row) return res.status(404).json({ detail: 'Record not found' })
    if (req.user!.role === 'teacher') {
      const teaches = await TeacherSubject.findOne({ where: { teacherId: req.user!.sub, subjectId: row.subjectId } })
      if (!teaches && !(await isClassTeacherOfStudent(req.user!.sub, row.studentId))) {
        return res.status(403).json({ detail: 'You are not assigned to teach this subject or this student\'s class' })
      }
    }
    await row.destroy()
    res.json({ message: 'Removed' })
  } catch (err) {
    next(err)
  }
})

export default router
