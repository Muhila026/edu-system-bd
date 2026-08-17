import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** Page-level access toggle for a role, e.g. Teacher can/cannot see "Attendance". */
export interface RolePermissionAttributes {
  id: number
  role: string
  pageKey: string
  allowed: boolean
}

type RolePermissionCreationAttributes = Optional<RolePermissionAttributes, 'id' | 'allowed'>

export class RolePermission
  extends Model<RolePermissionAttributes, RolePermissionCreationAttributes>
  implements RolePermissionAttributes
{
  declare id: number
  declare role: string
  declare pageKey: string
  declare allowed: boolean
}

RolePermission.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    role: { type: DataTypes.STRING(30), allowNull: false },
    pageKey: { type: DataTypes.STRING(60), allowNull: false },
    allowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    tableName: 'role_permissions',
    timestamps: true,
    indexes: [{ unique: true, fields: ['role', 'pageKey'] }],
  }
)
