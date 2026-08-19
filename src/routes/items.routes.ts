import { Router } from 'express'
import { sequelize } from '../config/database'
import { ItemRecord } from '../models/ItemRecord'
import { InventoryItem, SchoolItemType } from '../models/InventoryItem'
import { User } from '../models/User'
import { requireAuth, requireRole, requireAdminOrStaffFor, requireRoleOr, AuthedRequest } from '../middleware/auth'

const router = Router()

const SCHOOL_ITEM_TYPES: SchoolItemType[] = [
  'Report Card',
  'Communication Book',
  'Uniform Set',
  'Cap',
  'Badge',
  'Tie',
  'Uniform Package (Bundle)',
]

async function serialize(r: ItemRecord) {
  const [student, inventoryItem] = await Promise.all([
    User.findByPk(r.studentId),
    r.inventoryItemId ? InventoryItem.findByPk(r.inventoryItemId) : null,
  ])
  return {
    id: String(r.id),
    item: r.itemName,
    quantity: r.quantity,
    amount: Number(inventoryItem?.price ?? 0) * r.quantity,
    studentId: String(r.studentId),
    studentName: student?.name ?? '',
    studentEmail: student?.email ?? '',
    issuedDate: r.issuedDate,
    notes: r.notes,
  }
}

async function serializeMany(records: ItemRecord[]) {
  return Promise.all(records.map(serialize))
}

/** Catalog of purchasable items (and packages) with price — used by "Issue Item" and the student/parent "submit payment" picker. */
router.get('/items/inventory', requireAuth, async (_req, res, next) => {
  try {
    const items = await InventoryItem.findAll({ order: [['id', 'DESC']] })
    res.json(
      items.map((i) => ({
        id: String(i.id),
        name: i.name,
        price: Number(i.price),
        isPackage: i.isPackage,
        packageItems: i.packageItems ? (JSON.parse(i.packageItems) as string[]) : [],
      }))
    )
  } catch (err) {
    next(err)
  }
})

/** Admin: define a new purchasable package — a named bundle of existing item types at one price. */
router.post('/items/packages', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const { name, price, itemNames, stockQuantity } = req.body as {
      name?: string
      price?: number
      itemNames?: string[]
      stockQuantity?: number
    }
    if (!name?.trim()) return res.status(400).json({ detail: 'name is required' })
    if (price == null || price < 0) return res.status(400).json({ detail: 'A non-negative price is required' })
    if (!itemNames || itemNames.length === 0) return res.status(400).json({ detail: 'Select at least one item to include' })

    const existing = await InventoryItem.findOne({ where: { name: name.trim() } })
    if (existing) return res.status(409).json({ detail: `An item or package named "${name.trim()}" already exists` })

    const created = await InventoryItem.create({
      name: name.trim(),
      price,
      isPackage: true,
      packageItems: JSON.stringify(itemNames),
      stockQuantity: stockQuantity != null && stockQuantity >= 0 ? stockQuantity : null,
    })
    res.status(201).json({
      id: String(created.id),
      name: created.name,
      price: Number(created.price),
      isPackage: created.isPackage,
      packageItems: itemNames,
    })
  } catch (err) {
    next(err)
  }
})

/** Admin: define a new simple purchasable item — just a name and price, no bundling. */
router.post('/items/catalog', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const { name, price, stockQuantity } = req.body as {
      name?: string
      price?: number
      stockQuantity?: number
    }
    if (!name?.trim()) return res.status(400).json({ detail: 'name is required' })
    if (price == null || price < 0) return res.status(400).json({ detail: 'A non-negative price is required' })

    const existing = await InventoryItem.findOne({ where: { name: name.trim() } })
    if (existing) return res.status(409).json({ detail: `An item or package named "${name.trim()}" already exists` })

    const created = await InventoryItem.create({
      name: name.trim(),
      price,
      isPackage: false,
      stockQuantity: stockQuantity != null && stockQuantity >= 0 ? stockQuantity : null,
    })
    res.status(201).json({
      id: String(created.id),
      name: created.name,
      price: Number(created.price),
      isPackage: created.isPackage,
      packageItems: [],
    })
  } catch (err) {
    next(err)
  }
})

router.get('/items/types', requireAuth, async (_req, res) => {
  res.json(SCHOOL_ITEM_TYPES)
})

router.get('/items/records', requireAuth, requireRoleOr('teacher', requireAdminOrStaffFor('Payments')), async (req, res, next) => {
  try {
    const { studentEmail } = req.query as { studentEmail?: string }
    let where = {}
    if (studentEmail) {
      const student = await User.findOne({ where: { email: studentEmail } })
      where = { studentId: student?.id ?? -1 }
    }
    const records = await ItemRecord.findAll({ where, order: [['id', 'DESC']] })
    res.json(await serializeMany(records))
  } catch (err) {
    next(err)
  }
})

router.get('/items/me', requireAuth, requireRole('student'), async (req: AuthedRequest, res, next) => {
  try {
    const records = await ItemRecord.findAll({ where: { studentId: req.user!.sub }, order: [['id', 'DESC']] })
    res.json(await serializeMany(records))
  } catch (err) {
    next(err)
  }
})

/** Admin: fix a data-entry mistake on an already-issued item (quantity only — the original
 *  receipt/Transaction amount is left untouched, since money already changed hands). */
router.put('/items/records/:id', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  const t = await sequelize.transaction()
  try {
    const record = await ItemRecord.findByPk(req.params.id, { transaction: t })
    if (!record) {
      await t.rollback()
      return res.status(404).json({ detail: 'Item record not found' })
    }
    const { quantity } = req.body as { quantity?: number }
    if (quantity != null && quantity > 0 && quantity !== record.quantity) {
      const delta = quantity - record.quantity
      if (record.inventoryItemId) {
        const inventoryItem = await InventoryItem.findByPk(record.inventoryItemId, { transaction: t })
        if (inventoryItem?.stockQuantity != null) {
          if (inventoryItem.stockQuantity - delta < 0) {
            await t.rollback()
            return res.status(409).json({ detail: `Insufficient stock: only ${inventoryItem.stockQuantity} unit(s) left` })
          }
          inventoryItem.stockQuantity -= delta
          await inventoryItem.save({ transaction: t })
        }
      }
      record.quantity = quantity
      await record.save({ transaction: t })
    }
    await t.commit()
    const records = await ItemRecord.findAll({ order: [['id', 'DESC']] })
    res.json(await serializeMany(records))
  } catch (err) {
    await t.rollback()
    next(err)
  }
})

router.delete('/items/records/:id', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const record = await ItemRecord.findByPk(req.params.id)
    if (!record) return res.status(404).json({ detail: 'Item record not found' })
    await record.destroy()
    const records = await ItemRecord.findAll({ order: [['id', 'DESC']] })
    res.json(await serializeMany(records))
  } catch (err) {
    next(err)
  }
})

/** Admin: edit an existing package's name, price, included items, or stock. */
router.put('/items/packages/:id', requireAuth, requireAdminOrStaffFor('Payments'), async (req, res, next) => {
  try {
    const item = await InventoryItem.findByPk(req.params.id)
    if (!item || !item.isPackage) return res.status(404).json({ detail: 'Package not found' })
    const { name, price, itemNames, stockQuantity } = req.body as {
      name?: string
      price?: number
      itemNames?: string[]
      stockQuantity?: number | null
    }
    if (name?.trim()) item.name = name.trim()
    if (price != null && price >= 0) item.price = price
    if (itemNames && itemNames.length > 0) item.packageItems = JSON.stringify(itemNames)
    if (stockQuantity !== undefined) item.stockQuantity = stockQuantity != null && stockQuantity >= 0 ? stockQuantity : null
    await item.save()
    res.json({
      id: String(item.id),
      name: item.name,
      price: Number(item.price),
      isPackage: item.isPackage,
      packageItems: item.packageItems ? (JSON.parse(item.packageItems) as string[]) : [],
    })
  } catch (err) {
    next(err)
  }
})

export default router
