import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

export interface AcademicYearAttributes {
  id: number
  year: number // e.g. 2026
  isCurrent: boolean
  startDate: string | null
  endDate: string | null
}

type AcademicYearCreationAttributes = Optional<AcademicYearAttributes, 'id' | 'isCurrent' | 'startDate' | 'endDate'>

export class AcademicYear
  extends Model<AcademicYearAttributes, AcademicYearCreationAttributes>
  implements AcademicYearAttributes
{
  declare id: number
  declare year: number
  declare isCurrent: boolean
  declare startDate: string | null
  declare endDate: string | null
}

AcademicYear.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    year: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    isCurrent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    sequelize,
    tableName: 'academic_years',
    timestamps: true,
  }
)
