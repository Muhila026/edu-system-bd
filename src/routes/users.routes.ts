import { Router } from 'express'
import { User, UserRole } from '../models/User'
import { StudentProfile, GradeLevel, Gender } from '../models/StudentProfile'
import { TeacherProfile } from '../models/TeacherProfile'
import { Parent } from '../models/Parent'
import { ParentChildLink, GuardianRelationship } from '../models/ParentChildLink'
import { ClassEnrollment } from '../models/ClassEnrollment'
import { FeeRecord } from '../models/FeeRecord'
import { ItemRecord } from '../models/ItemRecord'
import { Transaction } from '../models/Transaction'
import { hashPassword } from '../utils/password'
import { requireAuth, requireRole, requireAdminOrAbove, AuthedRequest } from '../middleware/auth'
import { displayIdForRole, ensureDisplayId } from '../utils/displayId'

const ASSIGNABLE_ROLES: UserRole[] = ['Student', 'Teacher', 'Admin', 'Super Admin', 'Parent']

const router = Router()

/** Fields the admin fills in on the Add User form, specific to the Student/Teacher/Parent role. */
interface RoleProfileInput {
  // Student
  gradeLevel?: GradeLevel
  dateOfBirth?: string
  gender?: Gender
  admissionDate?: string
  // Teacher
  qualification?: string
  subjectSpecialization?: string
  joiningDate?: string
  // Parent
  occupation?: string
  address?: string
  emergencyContact?: string
  linkedStudentEmail?: string
  relationship?: GuardianRelationship
}

/** Every required field for the given role, per the school's data schema. */
function validateRoleProfile(role: UserRole, input: RoleProfileInput): string | null {
  if (role === 'Student') {
    if (!input.gradeLevel || !input.dateOfBirth || !input.gender) {
      return 'gradeLevel, dateOfBirth and gender are required to add a student'
    }
  } else if (role === 'Teacher') {
    if (!input.qualification?.trim() || !input.subjectSpecialization?.trim()) {
      return 'qualification and subjectSpecialization are required to add a teacher'
    }
  } else if (role === 'Parent') {
    if (!input.occupation?.trim() || !input.emergencyContact?.trim() || !input.address?.trim()) {
      return 'occupation, address and emergencyContact are required to add a parent'
    }
  }
  return null
}

/** Give every new Student/Teacher/Parent their own profile row (with a display ID for Student/Teacher). */
async function createRoleProfile(user: User, input: RoleProfileInput): Promise<void> {
  if (user.role === 'Student') {
    await StudentProfile.create({
      userId: user.id,
      studentCode: displayIdForRole('Student', user.id),
      gradeLevel: input.gradeLevel || 'Primary',
      dateOfBirth: input.dateOfBirth || null,
      gender: input.gender || null,
      admissionDate: input.admissionDate || new Date().toISOString().slice(0, 10),
    })
  } else if (user.role === 'Teacher') {
    await TeacherProfile.create({
      userId: user.id,
      employeeCode: displayIdForRole('Teacher', user.id),
      qualification: input.qualification?.trim() || null,
      subjectSpecialization: input.subjectSpecialization?.trim() || null,
      joiningDate: input.joiningDate || new Date().toISOString().slice(0, 10),
    })
  } else if (user.role === 'Parent') {
    await Parent.create({
      userId: user.id,
      occupation: input.occupation?.trim() || null,
      address: input.address?.trim() || null,
      emergencyContact: input.emergencyContact?.trim() || null,
    })
    if (input.linkedStudentEmail?.trim()) {
      const student = await User.findOne({ where: { email: input.linkedStudentEmail.trim().toLowerCase(), role: 'Student' } })
      if (student) {
        await ParentChildLink.findOrCreate({
          where: { parentUserId: user.id, studentUserId: student.id },
          defaults: { parentUserId: user.id, studentUserId: student.id, relationship: input.relationship || 'Guardian' },
        })
      }
    }
  }
}

function serialize(user: User) {
  return {
    id: user.id,
    displayId: displayIdForRole(user.role, user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    joinedDate: user.joinedDate,
  }
}

async function listByRole(role?: UserRole) {
  const users = await User.findAll({
    where: role ? { role } : undefined,
    order: [['id', 'DESC']],
  })
  return users.map(serialize)
}

// GET /admin/users — all users
router.get('/admin/users', requireAuth, requireAdminOrAbove, async (_req, res, next) => {
  try {
    res.json(await listByRole())
  } catch (err) {
    next(err)
  }
})

// GET /admin/students — students only (admin view)
router.get('/admin/students', requireAuth, requireRole('admin', 'super_admin', 'teacher'), async (_req, res, next) => {
  try {
    res.json(await listByRole('Student'))
  } catch (err) {
    next(err)
  }
})

// GET /admin/teachers — teachers only
router.get('/admin/teachers', requireAuth, requireAdminOrAbove, async (_req, res, next) => {
  try {
    res.json(await listByRole('Teacher'))
  } catch (err) {
    next(err)
  }
})

// GET /teachers/students — students only (teacher's own view)
router.get('/teachers/students', requireAuth, requireRole('teacher', 'admin'), async (_req, res, next) => {
  try {
    res.json(await listByRole('Student'))
  } catch (err) {
    next(err)
  }
})

// POST /admin/users — create a user (student/teacher/admin/super admin/parent)
router.post('/admin/users', requireAuth, requireAdminOrAbove, async (req: AuthedRequest, res, next) => {
  try {
    const { name, email, role, status, password, phone, joinedDate, ...profileInput } = req.body as {
      name?: string
      email?: string
      role?: UserRole
      status?: 'Active' | 'Inactive'
      password?: string
      phone?: string
      joinedDate?: string
    } & RoleProfileInput
    if (!name?.trim() || !email?.trim() || !role || !password) {
      return res.status(400).json({ detail: 'name, email, role and password are required' })
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ detail: 'Invalid role' })
    }
    // Only a Super Admin may create another Super Admin (privilege escalation guard).
    if (role === 'Super Admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ detail: 'Only a Super Admin can create another Super Admin' })
    }
    const profileError = validateRoleProfile(role, profileInput)
    if (profileError) {
      return res.status(400).json({ detail: profileError })
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
      phone: phone?.trim() || null,
      role,
      status: status || 'Active',
      joinedDate: joinedDate || new Date().toISOString().slice(0, 10),
    })
    await createRoleProfile(user, profileInput)
    res.status(201).json(await listByRole())
  } catch (err) {
    next(err)
  }
})

// PUT /admin/users/:id — update name/email/role/status
router.put('/admin/users/:id', requireAuth, requireAdminOrAbove, async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.params.id)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const { name, email, role, status, joinedDate } = req.body as {
      name?: string
      email?: string
      role?: UserRole
      status?: 'Active' | 'Inactive'
      joinedDate?: string
    }
    if (name?.trim()) user.name = name.trim()
    if (email?.trim()) {
      const emailNormalized = email.trim().toLowerCase()
      if (emailNormalized !== user.email) {
        const existing = await User.findOne({ where: { email: emailNormalized } })
        if (existing && existing.id !== user.id) {
          return res.status(409).json({ detail: 'A user with this email already exists' })
        }
        user.email = emailNormalized
      }
    }
    if (role && ASSIGNABLE_ROLES.includes(role)) {
      if (role === 'Super Admin' && req.user?.role !== 'super_admin') {
        return res.status(403).json({ detail: 'Only a Super Admin can grant the Super Admin role' })
      }
      user.role = role
    }
    if (status && ['Active', 'Inactive'].includes(status)) user.status = status
    if (joinedDate) user.joinedDate = joinedDate
    await user.save()
    await ensureDisplayId(user)
    res.json(await listByRole())
  } catch (err) {
    next(err)
  }
})

// PUT /admin/change-user-password — admin resets another user's password (no current-password check).
router.put('/admin/change-user-password', requireAuth, requireAdminOrAbove, async (req: AuthedRequest, res, next) => {
  try {
    const { user_id, email, new_password } = req.body as { user_id?: number; email?: string; new_password?: string }
    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ detail: 'new_password must be at least 6 characters' })
    }
    if (!user_id && !email) {
      return res.status(400).json({ detail: 'user_id or email is required' })
    }
    const user = user_id
      ? await User.findByPk(user_id)
      : await User.findOne({ where: { email: email!.trim().toLowerCase() } })
    if (!user) return res.status(404).json({ detail: 'User not found' })
    // Only a Super Admin may reset another Super Admin's password (privilege escalation guard).
    if (user.role === 'Super Admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ detail: 'Only a Super Admin can reset a Super Admin\'s password' })
    }
    user.passwordHash = await hashPassword(new_password)
    await user.save()
    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    next(err)
  }
})

// DELETE /admin/users/:id
router.delete('/admin/users/:id', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id)
    if (!user) return res.status(404).json({ detail: 'User not found' })

    // Financial/audit records are never silently cascade-deleted — ask the admin
    // to deactivate the account instead of losing that history.
    const [feeCount, itemCount, txnCount] = await Promise.all([
      FeeRecord.count({ where: { studentId: user.id } }),
      ItemRecord.count({ where: { studentId: user.id } }),
      Transaction.count({ where: { studentId: user.id } }),
    ])
    if (feeCount > 0 || itemCount > 0 || txnCount > 0) {
      return res.status(400).json({
        detail: 'This user has fee, item, or payment history and cannot be deleted. Set their status to Inactive instead.',
      })
    }

    // Profile metadata and messages are safe to remove along with the account.
    await Promise.all([
      StudentProfile.destroy({ where: { userId: user.id } }),
      TeacherProfile.destroy({ where: { userId: user.id } }),
      Parent.destroy({ where: { userId: user.id } }),
      ParentChildLink.destroy({ where: { parentUserId: user.id } }),
      ParentChildLink.destroy({ where: { studentUserId: user.id } }),
      ClassEnrollment.destroy({ where: { studentId: user.id } }),
    ])
    await user.destroy()
    res.json(await listByRole())
  } catch (err) {
    next(err)
  }
})

export default router
