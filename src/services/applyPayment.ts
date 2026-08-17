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
}

/**
 * The single place that turns "a positive amount was received for a student, against a
 * fee/item/class" into the actual side effects (fee balance, stock deduction + item issue,
 * or class enrollment installment) plus the audit-trail Transaction row.
 *
 * Shared by POST /payments/manual (admin keys in cash collected at the counter) and the
 * payment-request approval flow (admin approves a student/parent-submitted online-transfer
 * proof) so the two entry points can never drift apart in behavior.
 */
export async function applyPayment(input: ApplyPaymentInput, t: SequelizeTransaction) {
  const { student, type, referenceId, amount, quantity, paymentMode, notes, collectedByUserId } = input
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
    },
    { transaction: t }
  )

  return { transaction, receiptDetail }
}
