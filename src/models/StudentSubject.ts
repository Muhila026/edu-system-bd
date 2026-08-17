import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** Which subjects a student is enrolled in. */
export interface StudentSubjectAttributes {
  id: number
  studentId: number
  subjectId: number
}

type StudentSubjectCreationAttributes = Optional<StudentSubjectAttributes, 'id'>

export class StudentSubject
  extends Model<StudentSubjectAttributes, StudentSubjectCreationAttributes>
  implements StudentSubjectAttributes
{
  declare id: number
  declare studentId: number
  declare subjectId: number
}

StudentSubject.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: 'student_subjects',
    timestamps: true,
    indexes: [{ unique: true, fields: ['studentId', 'subjectId'] }],
  }
)
