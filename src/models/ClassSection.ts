import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { Grade } from './Grade'
import { AcademicYear } from './AcademicYear'
import { User } from './User'

/** A specific section/division of a grade for one academic year, e.g. "Grade 1 - A" in 2026. */
export interface ClassSectionAttributes {
  id: number
  gradeId: number
  academicYearId: number
  name: string // e.g. "A", "B" — combine with grade for "Grade 1A"
  classTeacherId: number | null
}

type ClassSectionCreationAttributes = Optional<ClassSectionAttributes, 'id' | 'classTeacherId'>

export class ClassSection
  extends Model<ClassSectionAttributes, ClassSectionCreationAttributes>
  implements ClassSectionAttributes
{
  declare id: number
  declare gradeId: number
  declare academicYearId: number
  declare name: string
  declare classTeacherId: number | null
}

ClassSection.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    gradeId: { type: DataTypes.INTEGER, allowNull: false },
    academicYearId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(20), allowNull: false },
    classTeacherId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'class_sections',
    timestamps: true,
  }
)

ClassSection.belongsTo(Grade, { foreignKey: 'gradeId', as: 'grade' })
ClassSection.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' })
ClassSection.belongsTo(User, { foreignKey: 'classTeacherId', as: 'classTeacher' })
Grade.hasMany(ClassSection, { foreignKey: 'gradeId', as: 'classSections' })
