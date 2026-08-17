import { Request, Response, NextFunction } from 'express'
import { verifyToken, JwtPayload } from '../utils/jwt'

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

export function requireRole(...roles: Array<'student' | 'teacher' | 'admin' | 'super_admin' | 'parent'>) {
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
