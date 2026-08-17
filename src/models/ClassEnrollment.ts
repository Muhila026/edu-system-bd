import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'
import { AfterSchoolClass } from './AfterSchoolClass'

export type EnrollmentStatus = 'Active' | 'Pending' | 'Completed'

export interface ClassEnrollmentAttributes {
  id: number
  classId: number
  studentId: number
  enrolledDate: string
  status: EnrollmentStatus
  amountPaid: number
}

type ClassEnrollmentCreationAttributes = Optional<ClassEnrollmentAttributes, 'id' | 'status' | 'amountPaid'>

export class ClassEnrollment
  extends Model<ClassEnrollmentAttributes, ClassEnrollmentCreationAttributes>
  implements ClassEnrollmentAttributes
{
  declare id: number
  declare classId: number
  declare studentId: number
  declare enrolledDate: string
  declare status: EnrollmentStatus
  declare amountPaid: number
}

ClassEnrollment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    classId: { type: DataTypes.INTEGER, allowNull: false },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    enrolledDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    status: { type: DataTypes.ENUM('Active', 'Pending', 'Completed'), allowNull: false, defaultValue: 'Pending' },
    amountPaid: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    tableName: 'class_enrollments',
    timestamps: true,
  }
)

ClassEnrollment.belongsTo(AfterSchoolClass, { foreignKey: 'classId', as: 'afterSchoolClass' })
ClassEnrollment.belongsTo(User, { foreignKey: 'studentId', as: 'student' })
