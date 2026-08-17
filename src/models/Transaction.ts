import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'

export type TransactionType = 'Fee' | 'Item' | 'After-School Class'
export type PaymentMode = 'Cash' | 'Card' | 'Online Transfer'

export interface TransactionAttributes {
  id: number
  studentId: number
  amount: number
  paymentDate: string
  type: TransactionType
  referenceId: number | null
  receiptNumber: string
  notes: string | null
  paymentMode: PaymentMode
  /** Admin/Super Admin user who processed this payment — needed for daily cash reconciliation. */
  collectedByUserId: number | null
}

type TransactionCreationAttributes = Optional<
  TransactionAttributes,
  'id' | 'referenceId' | 'notes' | 'paymentMode' | 'collectedByUserId'
>

export class Transaction
  extends Model<TransactionAttributes, TransactionCreationAttributes>
  implements TransactionAttributes
{
  declare id: number
  declare studentId: number
  declare amount: number
  declare paymentDate: string
  declare type: TransactionType
  declare referenceId: number | null
  declare receiptNumber: string
  declare notes: string | null
  declare paymentMode: PaymentMode
  declare collectedByUserId: number | null
}

Transaction.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    type: { type: DataTypes.ENUM('Fee', 'Item', 'After-School Class'), allowNull: false },
    referenceId: { type: DataTypes.INTEGER, allowNull: true },
    receiptNumber: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    paymentMode: { type: DataTypes.ENUM('Cash', 'Card', 'Online Transfer'), allowNull: false, defaultValue: 'Cash' },
    collectedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'transactions',
    timestamps: true,
  }
)

Transaction.belongsTo(User, { foreignKey: 'studentId', as: 'student' })
Transaction.belongsTo(User, { foreignKey: 'collectedByUserId', as: 'collectedBy' })
