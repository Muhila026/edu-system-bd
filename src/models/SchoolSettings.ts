import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** Single-row table: the school's display name and logo, editable by Admin/Super Admin. */
export interface SchoolSettingsAttributes {
  id: number
  schoolName: string
  logoPath: string | null
}

type SchoolSettingsCreationAttributes = Optional<SchoolSettingsAttributes, 'id' | 'logoPath'>

export class SchoolSettings
  extends Model<SchoolSettingsAttributes, SchoolSettingsCreationAttributes>
  implements SchoolSettingsAttributes
{
  declare id: number
  declare schoolName: string
  declare logoPath: string | null
}

SchoolSettings.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schoolName: { type: DataTypes.STRING(150), allowNull: false, defaultValue: 'Cloud Campus' },
    logoPath: { type: DataTypes.STRING(255), allowNull: true },
  },
  {
    sequelize,
    tableName: 'school_settings',
    timestamps: true,
  }
)
