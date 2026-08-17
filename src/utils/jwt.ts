import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

// 'super_admin' (with underscore) matches the frontend's normalizeRole(), which
// already maps that exact slug to the admin UI while keeping it distinct for
// backend authorization checks (see requireRole in middleware/auth.ts).
export type JwtPayload = {
  sub: number
  email: string
  role: 'student' | 'teacher' | 'admin' | 'super_admin' | 'parent'
  name: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload
}
