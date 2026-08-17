import { Router } from 'express'
import { CustomRole } from '../models/CustomRole'
import { requireAuth, requireAdminOrAbove } from '../middleware/auth'

const router = Router()

/** Fixed system roles that always exist and cannot be deleted. */
const SYSTEM_ROLES: Array<{ roleKey: string; displayName: string; description: string }> = [
  { roleKey: 'Student', displayName: 'Student', description: 'Enrolled student account' },
  { roleKey: 'Teacher', displayName: 'Teacher', description: 'Teaching staff account' },
  { roleKey: 'Admin', displayName: 'Administrator', description: 'Office/billing staff account' },
  { roleKey: 'Super Admin', displayName: 'Super Admin', description: 'Full system control' },
  { roleKey: 'Parent', displayName: 'Parent', description: 'Guardian read-only account' },
]
const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.roleKey)

function serialize(r: CustomRole) {
  return { roleKey: r.roleKey, displayName: r.displayName, description: r.description ?? undefined }
}

router.get('/users/roles', requireAuth, requireAdminOrAbove, async (_req, res, next) => {
  try {
    const customRoles = await CustomRole.findAll({ order: [['id', 'DESC']] })
    const overrides = new Map(customRoles.map((r) => [r.roleKey, r]))
    const systemWithOverrides = SYSTEM_ROLES.map((r) => {
      const override = overrides.get(r.roleKey)
      return override ? serialize(override) : r
    })
    const extraCustom = customRoles.filter((r) => !SYSTEM_ROLE_KEYS.includes(r.roleKey)).map(serialize)
    res.json([...systemWithOverrides, ...extraCustom])
  } catch (err) {
    next(err)
  }
})

router.post('/users/roles', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { roleKey, displayName, description } = req.body as { roleKey?: string; displayName?: string; description?: string }
    if (!roleKey?.trim() || !displayName?.trim()) {
      return res.status(400).json({ detail: 'roleKey and displayName are required' })
    }
    const existing = await CustomRole.findOne({ where: { roleKey: roleKey.trim() } })
    if (existing || SYSTEM_ROLE_KEYS.includes(roleKey.trim())) {
      return res.status(409).json({ detail: 'A role with this key already exists' })
    }
    const role = await CustomRole.create({
      roleKey: roleKey.trim(),
      displayName: displayName.trim(),
      description: description?.trim() || null,
    })
    res.status(201).json(serialize(role))
  } catch (err) {
    next(err)
  }
})

router.put('/users/roles/:roleKey', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    const { displayName, description } = req.body as { displayName?: string; description?: string }
    const [role] = await CustomRole.findOrCreate({
      where: { roleKey: req.params.roleKey },
      defaults: { roleKey: req.params.roleKey, displayName: displayName?.trim() || req.params.roleKey },
    })
    if (displayName?.trim()) role.displayName = displayName.trim()
    if (description !== undefined) role.description = description?.trim() || null
    await role.save()
    res.json(serialize(role))
  } catch (err) {
    next(err)
  }
})

router.delete('/users/roles/:roleKey', requireAuth, requireAdminOrAbove, async (req, res, next) => {
  try {
    if (SYSTEM_ROLE_KEYS.includes(req.params.roleKey)) {
      return res.status(400).json({ detail: 'System roles cannot be deleted' })
    }
    const role = await CustomRole.findOne({ where: { roleKey: req.params.roleKey } })
    if (!role) return res.status(404).json({ detail: 'Role not found' })
    await role.destroy()
    res.json({ message: 'Role deleted' })
  } catch (err) {
    next(err)
  }
})

export default router
