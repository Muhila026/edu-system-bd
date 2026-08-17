import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'
import { Grade } from './Grade'
import { ClassSection } from './ClassSection'

export type GradeLevel = 'Primary' | 'Secondary' | 'O/L' | 'A/L'
export type Gender = 'Male' | 'Female' | 'Other'

export interface StudentProfileAttributes {
  id: number
  userId: number
  gradeLevel: GradeLevel
  dateOfBirth: string | null
  gender: Gender | null
  gradeId: number | null
  classSectionId: number | null
  admissionDate: string
  address: string | null
  /** Display-only student ID string (distinct from the DB primary key). */
  studentCode: string | null
  program: string | null
  batch: string | null
  currentSemester: number | null
  gpa: string | null
}

type StudentProfileCreationAttributes = Optional<
  StudentProfileAttributes,
  | 'id'
  | 'dateOfBirth'
  | 'gender'
  | 'gradeId'
  | 'classSectionId'
  | 'admissionDate'
  | 'address'
  | 'studentCode'
  | 'program'
  | 'batch'
  | 'currentSemester'
  | 'gpa'
>

export class StudentProfile
  extends Model<StudentProfileAttributes, StudentProfileCreationAttributes>
  implements StudentProfileAttributes
{
  declare id: number
  declare userId: number
  declare gradeLevel: GradeLevel
  declare dateOfBirth: string | null
  declare gender: Gender | null
  declare gradeId: number | null
  declare classSectionId: number | null
  declare admissionDate: string
  declare address: string | null
  declare studentCode: string | null
  declare program: string | null
  declare batch: string | null
  declare currentSemester: number | null
  declare gpa: string | null
}

StudentProfile.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    gradeLevel: { type: DataTypes.ENUM('Primary', 'Secondary', 'O/L', 'A/L'), allowNull: false, defaultValue: 'Primary' },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: true },
    gradeId: { type: DataTypes.INTEGER, allowNull: true },
    classSectionId: { type: DataTypes.INTEGER, allowNull: true },
    admissionDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    address: { type: DataTypes.TEXT, allowNull: true },
    studentCode: { type: DataTypes.STRING(50), allowNull: true, unique: true },
    program: { type: DataTypes.STRING(150), allowNull: true },
    batch: { type: DataTypes.STRING(50), allowNull: true },
    currentSemester: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 1 },
    gpa: { type: DataTypes.STRING(20), allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_profiles',
    timestamps: true,
  }
)

StudentProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' })
User.hasOne(StudentProfile, { foreignKey: 'userId', as: 'studentProfile' })
StudentProfile.belongsTo(Grade, { foreignKey: 'gradeId', as: 'grade' })
StudentProfile.belongsTo(ClassSection, { foreignKey: 'classSectionId', as: 'classSection' })
