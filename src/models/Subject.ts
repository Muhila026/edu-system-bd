import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

export interface SubjectAttributes {
  id: number
  subjectName: string
  attendanceDays: number | null
}

type SubjectCreationAttributes = Optional<SubjectAttributes, 'id' | 'attendanceDays'>

export class Subject extends Model<SubjectAttributes, SubjectCreationAttributes> implements SubjectAttributes {
  declare id: number
  declare subjectName: string
  declare attendanceDays: number | null
}

Subject.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    subjectName: { type: DataTypes.STRING(150), allowNull: false },
    attendanceDays: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    tableName: 'subjects',
    timestamps: true,
  }
)
