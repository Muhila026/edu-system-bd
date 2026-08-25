import path from 'path'
import fs from 'fs'
import multer from 'multer'

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'payment-proofs')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

/** Optional receipt/proof image attached by admin/staff when recording a payment. */
export const proofUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      const userId = (req as { user?: { sub: number } }).user?.sub ?? 'admin'
      cb(null, `${userId}-${Date.now()}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Proof must be an image file'))
    cb(null, true)
  },
})

export function proofImageUrl(proofImagePath: string | null): string | null {
  return proofImagePath ? `/uploads/payment-proofs/${path.basename(proofImagePath)}` : null
}
