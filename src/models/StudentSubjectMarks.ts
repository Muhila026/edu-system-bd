import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** A student's marks for one exam/subject entry. One row per (student, subject, examType). */
export type ExamType = 'Assignment' | 'Quiz' | 'Mid Exam' | 'Term Exam' | 'Final Exam'

export interface StudentSubjectMarksAttributes {
  id: number
  studentId: number
  subjectId: number
  examType: ExamType
  marks: number
  note: string | null
}

type StudentSubjectMarksCreationAttributes = Optional<StudentSubjectMarksAttributes, 'id' | 'marks' | 'note'>

export class StudentSubjectMarks
  extends Model<StudentSubjectMarksAttributes, StudentSubjectMarksCreationAttributes>
  implements StudentSubjectMarksAttributes
{
  declare id: number
  declare studentId: number
  declare subjectId: number
  declare examType: ExamType
  declare marks: number
  declare note: string | null
}

StudentSubjectMarks.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    subjectId: { type: DataTypes.INTEGER, allowNull: false },
    examType: {
      type: DataTypes.ENUM('Assignment', 'Quiz', 'Mid Exam', 'Term Exam', 'Final Exam'),
      allowNull: false,
    },
    marks: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    note: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    tableName: 'student_subject_marks',
    timestamps: true,
    indexes: [{ unique: true, fields: ['studentId', 'subjectId', 'examType'] }],
  }
)
