import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/**
 * 'Super Admin' = CEO/management: full financial analytics, cash reconciliation audit, user management.
 * 'Admin' = office/billing staff: enrollment, manual cash payments, inventory issuance, receipts.
 * 'Parent' = guardian: read-only view of their own linked children (fees, attendance, results, receipts).
 */
export type UserRole = 'Student' | 'Teacher' | 'Admin' | 'Super Admin' | 'Parent'
export type UserStatus = 'Active' | 'Inactive'

export interface UserAttributes {
  id: number
  name: string
  email: string
  passwordHash: string
  phone: string | null
  role: UserRole
  status: UserStatus
  joinedDate: string
}

type UserCreationAttributes = Optional<UserAttributes, 'id' | 'phone' | 'status' | 'joinedDate'>

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: number
  declare name: string
  declare email: string
  declare passwordHash: string
  declare phone: string | null
  declare role: UserRole
  declare status: UserStatus
  declare joinedDate: string
}

User.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    role: { type: DataTypes.ENUM('Student', 'Teacher', 'Admin', 'Super Admin', 'Parent'), allowNull: false },
    status: { type: DataTypes.ENUM('Active', 'Inactive'), allowNull: false, defaultValue: 'Active' },
    joinedDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'users',
    timestamps: true,
  }
)
