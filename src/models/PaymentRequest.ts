import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'
import { TransactionType, PaymentMode } from './Transaction'

export type PaymentRequestStatus = 'Pending' | 'Approved' | 'Rejected'

/**
 * A student/parent-submitted "I paid via bank transfer" claim, with proof, waiting on an
 * Admin/Super Admin to verify and approve it before the payment actually counts (see
 * services/applyPayment.ts, run at approval time).
 */
export interface PaymentRequestAttributes {
  id: number
  studentId: number
  submittedByUserId: number
  type: TransactionType
  referenceId: number
  quantity: number | null
  amount: number
  paymentMode: PaymentMode
  receiptNumber: string | null
  proofImagePath: string
  note: string | null
  status: PaymentRequestStatus
  reviewedByUserId: number | null
  reviewNote: string | null
  reviewedAt: Date | null
  transactionId: number | null
}

type PaymentRequestCreationAttributes = Optional<
  PaymentRequestAttributes,
  | 'id'
  | 'quantity'
  | 'paymentMode'
  | 'receiptNumber'
  | 'note'
  | 'status'
  | 'reviewedByUserId'
  | 'reviewNote'
  | 'reviewedAt'
  | 'transactionId'
>

export class PaymentRequest
  extends Model<PaymentRequestAttributes, PaymentRequestCreationAttributes>
  implements PaymentRequestAttributes
{
  declare id: number
  declare studentId: number
  declare submittedByUserId: number
  declare type: TransactionType
  declare referenceId: number
  declare quantity: number | null
  declare amount: number
  declare paymentMode: PaymentMode
  declare receiptNumber: string | null
  declare proofImagePath: string
  declare note: string | null
  declare status: PaymentRequestStatus
  declare reviewedByUserId: number | null
  declare reviewNote: string | null
  declare reviewedAt: Date | null
  declare transactionId: number | null
}

PaymentRequest.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    submittedByUserId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('Fee', 'Item', 'After-School Class'), allowNull: false },
    referenceId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    paymentMode: { type: DataTypes.ENUM('Cash', 'Card', 'Online Transfer'), allowNull: false, defaultValue: 'Online Transfer' },
    receiptNumber: { type: DataTypes.STRING(100), allowNull: true },
    proofImagePath: { type: DataTypes.STRING(255), allowNull: false },
    note: { type: DataTypes.STRING(500), allowNull: true },
    status: { type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'), allowNull: false, defaultValue: 'Pending' },
    reviewedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    reviewNote: { type: DataTypes.STRING(500), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    transactionId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'payment_requests',
    timestamps: true,
  }
)

PaymentRequest.belongsTo(User, { foreignKey: 'studentId', as: 'student' })
PaymentRequest.belongsTo(User, { foreignKey: 'submittedByUserId', as: 'submittedBy' })
PaymentRequest.belongsTo(User, { foreignKey: 'reviewedByUserId', as: 'reviewedBy' })
