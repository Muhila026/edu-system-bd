import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

export interface CustomRoleAttributes {
  id: number
  roleKey: string
  displayName: string
  description: string | null
}

type CustomRoleCreationAttributes = Optional<CustomRoleAttributes, 'id' | 'description'>

export class CustomRole
  extends Model<CustomRoleAttributes, CustomRoleCreationAttributes>
  implements CustomRoleAttributes
{
  declare id: number
  declare roleKey: string
  declare displayName: string
  declare description: string | null
}

CustomRole.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    roleKey: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    displayName: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'custom_roles',
    timestamps: true,
  }
)
