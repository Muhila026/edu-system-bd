import { Router } from 'express'
import crypto from 'crypto'
import { User, UserRole } from '../models/User'
import { PasswordReset } from '../models/PasswordReset'
import { comparePassword, hashPassword } from '../utils/password'
import { signToken, JwtPayload } from '../utils/jwt'
import { requireAuth, AuthedRequest } from '../middleware/auth'

const router = Router()

const OTP_TTL_MS = 10 * 60 * 1000
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000

function generateOtp(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/** Maps a User.role value to the lowercase, underscored JWT/frontend role slug. */
function roleSlug(role: UserRole): JwtPayload['role'] {
  if (role === 'Super Admin') return 'super_admin'
  return role.toLowerCase() as 'student' | 'teacher' | 'admin' | 'parent'
}

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      return res.status(400).json({ detail: 'Email and password are required' })
    }
    const user = await User.findOne({ where: { email: email.trim().toLowerCase() } })
    if (!user) {
      return res.status(401).json({ detail: 'Invalid credentials' })
    }
    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ detail: 'Invalid credentials' })
    }
    if (user.status === 'Inactive') {
      return res.status(403).json({ detail: 'This account has been deactivated' })
    }

    const role = roleSlug(user.role)
    const token = signToken({ sub: user.id, email: user.email, role, name: user.name })

    res.json({
      access_token: token,
      token_type: 'Bearer',
      user: { id: user.id, email: user.email, role, name: user.name },
    })
  } catch (err) {
    next(err)
  }
})

/** Self-service password change — the caller must prove they know their current password. */
router.post('/change-password', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const { current_password, new_password } = req.body as { current_password?: string; new_password?: string }
    if (!current_password || !new_password) {
      return res.status(400).json({ detail: 'current_password and new_password are required' })
    }
    if (new_password.length < 6) {
      return res.status(400).json({ detail: 'New password must be at least 6 characters' })
    }
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    const valid = await comparePassword(current_password, user.passwordHash)
    if (!valid) {
      return res.status(401).json({ detail: 'Current password is incorrect' })
    }
    user.passwordHash = await hashPassword(new_password)
    await user.save()
    res.json({ message: 'Password updated successfully' })
  } catch (err) {
    next(err)
  }
})

router.get('/me', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await User.findByPk(req.user!.sub)
    if (!user) return res.status(404).json({ detail: 'User not found' })
    res.json({ id: user.id, email: user.email, role: roleSlug(user.role), name: user.name })
  } catch (err) {
    next(err)
  }
})

/**
 * Request a password-reset OTP. Always responds with a generic success message so the
 * endpoint can't be used to enumerate registered emails. No SMTP is configured for this
 * deployment, so the OTP is returned directly in the response (dev/local fallback) instead
 * of being emailed — swap this for a real mailer once SMTP credentials are available.
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email) {
      return res.status(400).json({ detail: 'Email is required' })
    }
    const normalizedEmail = email.trim().toLowerCase()
    const user = await User.findOne({ where: { email: normalizedEmail } })

    if (user) {
      const otp = generateOtp()
      const otpHash = await hashPassword(otp)
      const [pr] = await PasswordReset.findOrCreate({ where: { userId: user.id } })
      pr.otpHash = otpHash
      pr.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS)
      pr.resetTokenHash = null
      pr.resetTokenExpiresAt = null
      await pr.save()
      console.log(`[auth] Password reset OTP for ${normalizedEmail}: ${otp} (expires in 10 min)`)
      return res.json({ message: 'OTP generated. No email server is configured, so it is shown below instead.', otp })
    }

    res.json({ message: 'If an account exists for that email, an OTP has been generated.' })
  } catch (err) {
    next(err)
  }
})

/** Verify a forgot-password OTP and exchange it for a short-lived reset token. */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { email, otpCode } = req.body as { email?: string; otpCode?: string }
    if (!email || !otpCode) {
      return res.status(400).json({ detail: 'email and otpCode are required' })
    }
    const normalizedEmail = email.trim().toLowerCase()
    const user = await User.findOne({ where: { email: normalizedEmail } })
    const pr = user ? await PasswordReset.findOne({ where: { userId: user.id } }) : null

    if (!user || !pr || !pr.otpHash || !pr.otpExpiresAt || pr.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ detail: 'Invalid or expired OTP' })
    }
    const valid = await comparePassword(otpCode, pr.otpHash)
    if (!valid) {
      return res.status(400).json({ detail: 'Invalid or expired OTP' })
    }

    const resetToken = crypto.randomBytes(24).toString('hex')
    pr.resetTokenHash = await hashPassword(resetToken)
    pr.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)
    pr.otpHash = null
    pr.otpExpiresAt = null
    await pr.save()

    res.json({ success: true, message: 'OTP verified', data: { resetToken, email: normalizedEmail } })
  } catch (err) {
    next(err)
  }
})

/** Reset a password using either a resetToken (from verify-otp) or a raw otpCode (single-step flow). */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, newPassword, otpCode, resetToken } = req.body as {
      email?: string
      newPassword?: string
      otpCode?: string
      resetToken?: string
    }
    if (!email || !newPassword) {
      return res.status(400).json({ detail: 'email and newPassword are required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ detail: 'New password must be at least 6 characters' })
    }
    if (!otpCode && !resetToken) {
      return res.status(400).json({ detail: 'otpCode or resetToken is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const user = await User.findOne({ where: { email: normalizedEmail } })
    const pr = user ? await PasswordReset.findOne({ where: { userId: user.id } }) : null

    if (!user || !pr) {
      return res.status(400).json({ detail: 'Invalid or expired request' })
    }

    if (resetToken) {
      if (!pr.resetTokenHash || !pr.resetTokenExpiresAt || pr.resetTokenExpiresAt.getTime() < Date.now()) {
        return res.status(400).json({ detail: 'Invalid or expired reset token' })
      }
      const valid = await comparePassword(resetToken, pr.resetTokenHash)
      if (!valid) {
        return res.status(400).json({ detail: 'Invalid or expired reset token' })
      }
    } else {
      if (!pr.otpHash || !pr.otpExpiresAt || pr.otpExpiresAt.getTime() < Date.now()) {
        return res.status(400).json({ detail: 'Invalid or expired OTP' })
      }
      const valid = await comparePassword(otpCode!, pr.otpHash)
      if (!valid) {
        return res.status(400).json({ detail: 'Invalid or expired OTP' })
      }
    }

    user.passwordHash = await hashPassword(newPassword)
    await user.save()
    pr.otpHash = null
    pr.otpExpiresAt = null
    pr.resetTokenHash = null
    pr.resetTokenExpiresAt = null
    await pr.save()

    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    next(err)
  }
})

export default router
