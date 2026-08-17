import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

export interface PasswordResetAttributes {
  id: number
  userId: number
  otpHash: string | null
  otpExpiresAt: Date | null
  resetTokenHash: string | null
  resetTokenExpiresAt: Date | null
}

type PasswordResetCreationAttributes = Optional<
  PasswordResetAttributes,
  'id' | 'otpHash' | 'otpExpiresAt' | 'resetTokenHash' | 'resetTokenExpiresAt'
>

export class PasswordReset
  extends Model<PasswordResetAttributes, PasswordResetCreationAttributes>
  implements PasswordResetAttributes
{
  declare id: number
  declare userId: number
  declare otpHash: string | null
  declare otpExpiresAt: Date | null
  declare resetTokenHash: string | null
  declare resetTokenExpiresAt: Date | null
}

PasswordReset.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    otpHash: { type: DataTypes.STRING(255), allowNull: true },
    otpExpiresAt: { type: DataTypes.DATE, allowNull: true },
    resetTokenHash: { type: DataTypes.STRING(255), allowNull: true },
    resetTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'password_resets',
    timestamps: true,
  }
)
