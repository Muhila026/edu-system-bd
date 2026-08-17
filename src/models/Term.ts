import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { AcademicYear } from './AcademicYear'

export type TermName = 'Term 1' | 'Term 2' | 'Term 3'

export interface TermAttributes {
  id: number
  academicYearId: number
  name: TermName
  startDate: string | null
  endDate: string | null
}

type TermCreationAttributes = Optional<TermAttributes, 'id' | 'startDate' | 'endDate'>

export class Term extends Model<TermAttributes, TermCreationAttributes> implements TermAttributes {
  declare id: number
  declare academicYearId: number
  declare name: TermName
  declare startDate: string | null
  declare endDate: string | null
}

Term.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.ENUM('Term 1', 'Term 2', 'Term 3'), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: true },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
  },
  {
    sequelize,
    tableName: 'terms',
    timestamps: true,
  }
)

Term.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' })
AcademicYear.hasMany(Term, { foreignKey: 'academicYearId', as: 'terms' })
