import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { SchoolSettings } from '../models/SchoolSettings'
import { requireAuth, requireAdminOrAbove, AuthedRequest } from '../middleware/auth'

const router = Router()

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'school')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png'
      cb(null, `logo-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Logo must be an image file'))
    cb(null, true)
  },
})

async function getOrCreateSettings() {
  const [row] = await SchoolSettings.findOrCreate({ where: {}, defaults: { schoolName: 'Cloud Campus' } })
  return row
}

function serialize(row: SchoolSettings) {
  return {
    schoolName: row.schoolName,
    logoUrl: row.logoPath ? `/uploads/school/${path.basename(row.logoPath)}` : '/logo.png',
  }
}

// GET /school-settings — public (login page and every sidebar need this before/without auth).
router.get('/school-settings', async (_req, res, next) => {
  try {
    const row = await getOrCreateSettings()
    res.json(serialize(row))
  } catch (err) {
    next(err)
  }
})

// PUT /admin/school-settings — rename the school. Admin or Super Admin.
router.put('/admin/school-settings', requireAuth, requireAdminOrAbove, async (req: AuthedRequest, res, next) => {
  try {
    const { schoolName } = req.body as { schoolName?: string }
    if (!schoolName || !schoolName.trim()) {
      return res.status(400).json({ detail: 'schoolName is required' })
    }
    const row = await getOrCreateSettings()
    row.schoolName = schoolName.trim()
    await row.save()
    res.json(serialize(row))
  } catch (err) {
    next(err)
  }
})

// POST /admin/school-settings/logo — replace the school logo. Admin or Super Admin.
router.post(
  '/admin/school-settings/logo',
  requireAuth,
  requireAdminOrAbove,
  upload.single('logo'),
  async (req: AuthedRequest, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ detail: 'logo file is required' })
      const row = await getOrCreateSettings()
      const previousPath = row.logoPath
      row.logoPath = req.file.path
      await row.save()
      if (previousPath && fs.existsSync(previousPath)) {
        fs.unlink(previousPath, () => {})
      }
      res.json(serialize(row))
    } catch (err) {
      next(err)
    }
  }
)

export default router
