import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'
import { FeeStructure } from './FeeStructure'

export type FeeRecordStatus = 'Paid' | 'Unpaid' | 'Partial'

export interface FeeRecordAttributes {
  id: number
  feeStructureId: number
  studentId: number
  amount: number
  paidAmount: number
  status: FeeRecordStatus
  paidDate: string | null
}

type FeeRecordCreationAttributes = Optional<FeeRecordAttributes, 'id' | 'paidAmount' | 'status' | 'paidDate'>

export class FeeRecord extends Model<FeeRecordAttributes, FeeRecordCreationAttributes> implements FeeRecordAttributes {
  declare id: number
  declare feeStructureId: number
  declare studentId: number
  declare amount: number
  declare paidAmount: number
  declare status: FeeRecordStatus
  declare paidDate: string | null
}

FeeRecord.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    feeStructureId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    paidAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('Paid', 'Unpaid', 'Partial'), allowNull: false, defaultValue: 'Unpaid' },
    paidDate: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    sequelize,
    tableName: 'fee_records',
    timestamps: true,
  }
)

FeeRecord.belongsTo(FeeStructure, { foreignKey: 'feeStructureId', as: 'feeStructure' })
FeeRecord.belongsTo(User, { foreignKey: 'studentId', as: 'student' })
