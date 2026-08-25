import { Transaction as SequelizeTransaction } from 'sequelize'
import { User } from '../models/User'
import { FeeRecord } from '../models/FeeRecord'
import { FeeStructure } from '../models/FeeStructure'
import { InventoryItem } from '../models/InventoryItem'
import { ItemRecord } from '../models/ItemRecord'
import { AfterSchoolClass } from '../models/AfterSchoolClass'
import { ClassEnrollment } from '../models/ClassEnrollment'
import { Transaction, TransactionType, PaymentMode } from '../models/Transaction'

export class ApplyPaymentError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type ApplyPaymentInput = {
  student: User
  type: TransactionType
  referenceId: string
  amount: number
  quantity?: number // 'Item' payments only
  paymentMode: PaymentMode
  notes?: string
  collectedByUserId: number | null
  /** Filename of an optional receipt/proof image the collector attached. */
  proofImagePath?: string | null
}

/**
 * The single place that turns "a positive amount was received for a student, against a
 * fee/item/class" into the actual side effects (fee balance, stock deduction + item issue,
 * or class enrollment installment) plus the audit-trail Transaction row.
 *
 * Used by POST /payments/manual — admin/staff keying in what was collected at the counter.
 */
export async function applyPayment(input: ApplyPaymentInput, t: SequelizeTransaction) {
  const { student, type, referenceId, amount, quantity, paymentMode, notes, collectedByUserId, proofImagePath } = input
  let receiptDetail: Record<string, unknown> = {}

  if (type === 'Fee') {
    const record = await FeeRecord.findOne({ where: { id: referenceId, studentId: student.id }, transaction: t })
    if (!record) throw new ApplyPaymentError(404, 'Fee record not found for this student')
    const structure = await FeeStructure.findByPk(record.feeStructureId, { transaction: t })

    const newPaid = Math.min(Number(record.amount), Number(record.paidAmount) + amount)
    record.paidAmount = newPaid
    record.status = newPaid >= Number(record.amount) ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid'
    record.paidDate = new Date().toISOString().slice(0, 10)
    await record.save({ transaction: t })

    if (
      record.status === 'Paid' &&
      (structure?.feeType === 'Admission Fee' || structure?.feeType === 'School Fee') &&
      student.status === 'Inactive'
    ) {
      student.status = 'Active'
      await student.save({ transaction: t })
    }

    receiptDetail = {
      feeRecordId: String(record.id),
      feeType: structure?.feeType,
      title: structure?.title,
      balanceRemaining: Number(record.amount) - Number(record.paidAmount),
      status: record.status,
    }
  } else if (type === 'Item') {
    const item = await InventoryItem.findByPk(referenceId, { transaction: t })
    if (!item) throw new ApplyPaymentError(404, 'Inventory item not found')
    const qty = quantity && quantity > 0 ? quantity : 1

    if (!item.isPackage) {
      if (item.stockQuantity != null && item.stockQuantity < qty) {
        throw new ApplyPaymentError(409, `Insufficient stock: only ${item.stockQuantity} unit(s) of ${item.name} left`)
      }

      if (item.stockQuantity != null) {
        item.stockQuantity -= qty
        await item.save({ transaction: t })
      }

      const issued = await ItemRecord.create(
        {
          itemName: item.name,
          inventoryItemId: item.id,
          studentId: student.id,
          quantity: qty,
          issuedDate: new Date().toISOString().slice(0, 10),
          notes: notes?.trim() || null,
        },
        { transaction: t }
      )

      receiptDetail = {
        itemRecordId: String(issued.id),
        item: item.name,
        quantity: qty,
        remainingStock: item.stockQuantity,
      }
    } else {
      // Package: expand into one ItemRecord per included item so Issued Items / stock reflect
      // the actual contents, not just the bundle's catalog row.
      const includedNames: string[] = item.packageItems ? JSON.parse(item.packageItems) : []
      if (includedNames.length === 0) {
        throw new ApplyPaymentError(400, `Package "${item.name}" has no items configured`)
      }
      const includedItems = await InventoryItem.findAll({ where: { name: includedNames }, transaction: t })
      const byName = new Map(includedItems.map((i) => [i.name, i]))

      for (const name of includedNames) {
        const componentItem = byName.get(name)
        if (componentItem?.stockQuantity != null && componentItem.stockQuantity < qty) {
          throw new ApplyPaymentError(409, `Insufficient stock: only ${componentItem.stockQuantity} unit(s) of ${name} left`)
        }
      }

      const issuedRecords: ItemRecord[] = []
      for (const name of includedNames) {
        const componentItem = byName.get(name)
        if (componentItem?.stockQuantity != null) {
          componentItem.stockQuantity -= qty
          await componentItem.save({ transaction: t })
        }
        issuedRecords.push(
          await ItemRecord.create(
            {
              itemName: name,
              inventoryItemId: componentItem?.id ?? null,
              studentId: student.id,
              quantity: qty,
              issuedDate: new Date().toISOString().slice(0, 10),
              notes: notes?.trim() ? `${notes.trim()} (from package: ${item.name})` : `From package: ${item.name}`,
            },
            { transaction: t }
          )
        )
      }

      if (item.stockQuantity != null) {
        if (item.stockQuantity < qty) {
          throw new ApplyPaymentError(409, `Insufficient stock: only ${item.stockQuantity} unit(s) of ${item.name} left`)
        }
        item.stockQuantity -= qty
        await item.save({ transaction: t })
      }

      receiptDetail = {
        itemRecordIds: issuedRecords.map((r) => String(r.id)),
        item: item.name,
        includedItems: includedNames,
        quantity: qty,
        remainingStock: item.stockQuantity,
      }
    }
  } else if (type === 'After-School Class') {
    const cls = await AfterSchoolClass.findByPk(referenceId, { transaction: t })
    if (!cls) throw new ApplyPaymentError(404, 'After-school class not found')

    let enrollment = await ClassEnrollment.findOne({ where: { classId: cls.id, studentId: student.id }, transaction: t })
    if (!enrollment) {
      enrollment = await ClassEnrollment.create(
        { classId: cls.id, studentId: student.id, enrolledDate: new Date().toISOString().slice(0, 10) },
        { transaction: t }
      )
    }

    enrollment.amountPaid = Number(enrollment.amountPaid) + amount
    const target = cls.totalFee != null ? Number(cls.totalFee) : Number(cls.admissionFee)
    if (enrollment.amountPaid >= target) {
      enrollment.status = 'Active'
    }
    await enrollment.save({ transaction: t })

    receiptDetail = {
      enrollmentId: String(enrollment.id),
      class: cls.name,
      amountPaid: Number(enrollment.amountPaid),
      target,
      status: enrollment.status,
    }
  } else {
    throw new ApplyPaymentError(400, "type must be one of 'Fee', 'Item', 'After-School Class'")
  }

  const receiptNumber = `RCPT-${type.replace(/\s|\//g, '')[0]}${student.id}-${Date.now()}`
  const transaction = await Transaction.create(
    {
      studentId: student.id,
      amount,
      paymentDate: new Date().toISOString().slice(0, 10),
      type,
      referenceId: Number(referenceId) || null,
      receiptNumber,
      notes: notes?.trim() || null,
      paymentMode,
      collectedByUserId,
      proofImagePath: proofImagePath || null,
    },
    { transaction: t }
  )

  return { transaction, receiptDetail }
}
