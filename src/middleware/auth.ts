import { Request, Response, NextFunction } from 'express'
import { verifyToken, JwtPayload } from '../utils/jwt'
import { RolePermission } from '../models/RolePermission'

export interface AuthedRequest extends Request {
  user?: JwtPayload
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid Authorization header' })
  }
  const token = header.slice('Bearer '.length)
  try {
    req.user = verifyToken(token)
    next()
  } catch {
    return res.status(401).json({ detail: 'Invalid or expired token' })
  }
}

export function requireRole(...roles: Array<'student' | 'teacher' | 'admin' | 'super_admin' | 'staff' | 'parent'>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ detail: 'Not authenticated' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ detail: 'Insufficient permissions' })
    }
    next()
  }
}

/** Office/billing staff and above (Admin or Super Admin). Use for day-to-day admin panel routes. */
export function requireAdminOrAbove(req: AuthedRequest, res: Response, next: NextFunction) {
  return requireRole('admin', 'super_admin')(req, res, next)
}

/** CEO/management only — financial analytics, cash reconciliation audit, role/user governance. */
export function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  return requireRole('super_admin')(req, res, next)
}

/**
 * Admin/Super Admin always pass. 'staff' passes only if a Super Admin has toggled the given
 * page on for them in Settings (role_permissions table). A missing row means NOT allowed —
 * Staff is opt-in per page, unlike Teacher/Student/Parent's default-allowed pages.
 * Use this instead of requireAdminOrAbove on routes that back one of the four admin pages
 * Staff can be granted (User Management, Subjects, Class Details, Payments).
 */
export function requireAdminOrStaffFor(pageKeyOrKeys: string | string[]) {
  const pageKeys = Array.isArray(pageKeyOrKeys) ? pageKeyOrKeys : [pageKeyOrKeys]
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ detail: 'Not authenticated' })
    if (req.user.role === 'admin' || req.user.role === 'super_admin') return next()
    if (req.user.role === 'staff') {
      const rows = await RolePermission.findAll({ where: { role: 'staff', pageKey: pageKeys } })
      if (rows.some((r) => r.allowed)) return next()
    }
    return res.status(403).json({ detail: 'Insufficient permissions' })
  }
}

/** Passes if the caller has the given single role, otherwise defers to `fallback`. Use to let a
 *  role like 'teacher' bypass a page-permission check applied to Admin/Staff on a shared route. */
export function requireRoleOr(
  role: JwtPayload['role'],
  fallback: (req: AuthedRequest, res: Response, next: NextFunction) => void
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role === role) return next()
    return fallback(req, res, next)
  }
}
