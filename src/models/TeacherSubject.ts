import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** Which subjects a teacher is assigned to teach. */
export interface TeacherSubjectAttributes {
  id: number
  teacherId: number
  subjectId: number
}

type TeacherSubjectCreationAttributes = Optional<TeacherSubjectAttributes, 'id'>

export class TeacherSubject
  extends Model<TeacherSubjectAttributes, TeacherSubjectCreationAttributes>
  implements TeacherSubjectAttributes
{
  declare id: number
  declare teacherId: number
  declare subjectId: number
}

TeacherSubject.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    teacherId: { type: DataTypes.INTEGER, allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: 'teacher_subjects',
    timestamps: true,
    indexes: [{ unique: true, fields: ['teacherId', 'subjectId'] }],
  }
)
