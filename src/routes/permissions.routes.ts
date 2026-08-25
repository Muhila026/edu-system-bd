import { Router } from 'express'
import { RolePermission } from '../models/RolePermission'
import { requireAuth, requireSuperAdmin, AuthedRequest } from '../middleware/auth'

const router = Router()

/** Toggleable roles and the pages each one can see. Admin/Super Admin always have full access. */
export const TOGGLEABLE_PAGES: Record<string, string[]> = {
  teacher: ['Dashboard', 'My Class', 'Enter Marks', 'Manage Students'],
  student: ['Dashboard', 'My Subjects', 'Payment History', 'Payment Details', 'After-School Classes'],
  parent: ['Dashboard', 'Fees', 'Items', 'Receipts', 'Marks'],
  /** Staff is a limited-admin role: same page set as Admin, minus Settings, opt-in per page. */
  staff: ['Dashboard', 'User Management', 'Subjects', 'Class Details', 'Payments'],
}

// GET /admin/permissions — full grid for the Settings page, defaulting missing rows to allowed=true.
router.get('/admin/permissions', requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const rows = await RolePermission.findAll()
    const byRolePage = new Map(rows.map((r) => [`${r.role}:${r.pageKey}`, r.allowed]))

    const result: Record<string, Array<{ pageKey: string; allowed: boolean }>> = {}
    for (const [role, pages] of Object.entries(TOGGLEABLE_PAGES)) {
      result[role] = pages.map((pageKey) => ({
        pageKey,
        allowed: byRolePage.get(`${role}:${pageKey}`) ?? true,
      }))
    }
    res.json(result)
  } catch (err) {
    next(err)
  }
})

// PUT /admin/permissions — toggle one role+page.
router.put('/admin/permissions', requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const { role, pageKey, allowed } = req.body as { role?: string; pageKey?: string; allowed?: boolean }
    if (!role || !pageKey || allowed == null) {
      return res.status(400).json({ detail: 'role, pageKey and allowed are required' })
    }
    if (!TOGGLEABLE_PAGES[role]?.includes(pageKey)) {
      return res.status(400).json({ detail: 'Unknown role or page' })
    }
    const [row] = await RolePermission.findOrCreate({ where: { role, pageKey }, defaults: { role, pageKey, allowed } })
    row.allowed = allowed
    await row.save()
    res.json({ role, pageKey, allowed: row.allowed })
  } catch (err) {
    next(err)
  }
})

// GET /permissions/me — pages the current user's role is allowed to see (for sidebar filtering).
// Admin/Super Admin are never restricted.
router.get('/permissions/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const role = req.user!.role
    if (role === 'admin' || role === 'super_admin') {
      return res.json({ allPages: true, pages: [] })
    }
    const pages = TOGGLEABLE_PAGES[role]
    if (!pages) return res.json({ allPages: true, pages: [] })

    const rows = await RolePermission.findAll({ where: { role } })
    const byPage = new Map(rows.map((r) => [r.pageKey, r.allowed]))
    const allowedPages = pages.filter((p) => byPage.get(p) ?? true)
    res.json({ allPages: false, pages: allowedPages })
  } catch (err) {
    next(err)
  }
})

export default router
