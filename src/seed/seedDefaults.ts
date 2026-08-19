import { User } from '../models/User'
import { ParentChildLink } from '../models/ParentChildLink'
import { RolePermission } from '../models/RolePermission'
import { hashPassword } from '../utils/password'
import { ensureDisplayId } from '../utils/displayId'
import { TOGGLEABLE_PAGES } from '../routes/permissions.routes'

/**
 * Ensures the default Super Admin exists (required — CEO/management: full financial
 * analytics, cash reconciliation audit, user management). Also seeds a demo office/billing
 * staff Admin account, a demo parent linked to the demo student, and the demo student/teacher
 * accounts the frontend previously ran against in mock mode, so the existing demo login flow
 * keeps working once wired to this backend.
 */
export async function seedDefaults(): Promise<void> {
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@edu.com').toLowerCase()
  const superAdminName = process.env.SUPER_ADMIN_NAME || 'Admin Smith'
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'admin123'

  const existingSuperAdmin = await User.findOne({ where: { email: superAdminEmail } })
  if (!existingSuperAdmin) {
    await User.create({
      name: superAdminName,
      email: superAdminEmail,
      passwordHash: await hashPassword(superAdminPassword),
      role: 'Super Admin',
      status: 'Active',
      joinedDate: new Date().toISOString().slice(0, 10),
    })
    console.log(`[seed] Created default Super Admin: ${superAdminEmail}`)
  }

  const seedDemo = (process.env.SEED_DEMO_ACCOUNTS || 'true').toLowerCase() !== 'false'
  if (!seedDemo) return

  const demoAccounts: Array<{ name: string; email: string; password: string; role: 'Student' | 'Teacher' | 'Admin' | 'Parent' }> = [
    { name: 'John Doe', email: 'student@edu.com', password: 'student123', role: 'Student' },
    { name: 'Dr. Emily Johnson', email: 'teacher@edu.com', password: 'teacher123', role: 'Teacher' },
    // Office/billing staff Admin — day-to-day enrollment, cash collection, inventory issuance.
    { name: 'Office Staff', email: 'office@edu.com', password: 'office123', role: 'Admin' },
    // Guardian of the demo student — read-only portal (fees, items, receipts).
    { name: 'Mary Doe', email: 'parent@edu.com', password: 'parent123', role: 'Parent' },
  ]

  for (const account of demoAccounts) {
    const existing = await User.findOne({ where: { email: account.email } })
    if (existing) continue
    await User.create({
      name: account.name,
      email: account.email,
      passwordHash: await hashPassword(account.password),
      role: account.role,
      status: 'Active',
      joinedDate: new Date().toISOString().slice(0, 10),
    })
    console.log(`[seed] Created demo ${account.role.toLowerCase()}: ${account.email}`)
  }

  const parent = await User.findOne({ where: { email: 'parent@edu.com' } })
  const student = await User.findOne({ where: { email: 'student@edu.com' } })
  if (parent && student) {
    const existingLink = await ParentChildLink.findOne({ where: { parentUserId: parent.id, studentUserId: student.id } })
    if (!existingLink) {
      await ParentChildLink.create({ parentUserId: parent.id, studentUserId: student.id, relationship: 'Mother' })
      console.log('[seed] Linked demo parent to demo student')
    }
  }

  await backfillDisplayIds()
  await seedStaffPermissions()
}

/**
 * Staff is opt-in per page (unlike Teacher/Student/Parent, whose missing rows default to
 * allowed=true — see requireAdminOrStaffFor). Seed an explicit row per toggleable page so the
 * Settings grid and the backend gate agree on the starting state: Dashboard and Payments on
 * (Dashboard is always-on and non-toggleable in the Settings UI, same as every other role), the
 * rest off — matching "add Staff to Payments" as the default. A Super Admin can flip on more
 * from there. Uses findOrCreate so it never overwrites a toggle a Super Admin already changed.
 */
async function seedStaffPermissions(): Promise<void> {
  const alwaysOn = ['Dashboard', 'Payments']
  for (const pageKey of TOGGLEABLE_PAGES.staff) {
    await RolePermission.findOrCreate({
      where: { role: 'staff', pageKey },
      defaults: { role: 'staff', pageKey, allowed: alwaysOn.includes(pageKey) },
    })
  }
}

/** Every role gets a display ID (ST00001, TE00001, AD00001, SA00001, PA00001, ...).
 *  Runs on every boot; only touches users missing a profile row or still on the old STU####/EMP#### format. */
async function backfillDisplayIds(): Promise<void> {
  const users = await User.findAll()
  for (const user of users) {
    await ensureDisplayId(user)
  }
}
