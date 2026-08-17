import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** Freeform course name, admin-typed (e.g. "Computer / IT Course", "Abacus", "Electrician Training", or any new course). */
export type AfterSchoolClassName = string
export type AfterSchoolClassLevel = 'O/L' | 'A/L' | 'All'

export interface AfterSchoolClassAttributes {
  id: number
  name: AfterSchoolClassName
  description: string | null
  schedule: string | null
  level: AfterSchoolClassLevel
  admissionFee: number
  totalFee: number | null
}

type AfterSchoolClassCreationAttributes = Optional<
  AfterSchoolClassAttributes,
  'id' | 'description' | 'schedule' | 'totalFee'
>

export class AfterSchoolClass
  extends Model<AfterSchoolClassAttributes, AfterSchoolClassCreationAttributes>
  implements AfterSchoolClassAttributes
{
  declare id: number
  declare name: AfterSchoolClassName
  declare description: string | null
  declare schedule: string | null
  declare level: AfterSchoolClassLevel
  declare admissionFee: number
  declare totalFee: number | null
}

AfterSchoolClass.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    schedule: { type: DataTypes.STRING(200), allowNull: true },
    level: { type: DataTypes.ENUM('O/L', 'A/L', 'All'), allowNull: false, defaultValue: 'All' },
    admissionFee: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 900 },
    totalFee: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  },
  {
    sequelize,
    tableName: 'after_school_classes',
    timestamps: true,
  }
)
