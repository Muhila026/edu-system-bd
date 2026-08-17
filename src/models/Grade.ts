import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

/** A static academic level, e.g. "Grade 1" .. "Grade 13" — not year-scoped. */
export interface GradeAttributes {
  id: number
  name: string // e.g. "Grade 1"
  order: number // sort/display order, e.g. 1..13
}

type GradeCreationAttributes = Optional<GradeAttributes, 'id'>

export class Grade extends Model<GradeAttributes, GradeCreationAttributes> implements GradeAttributes {
  declare id: number
  declare name: string
  declare order: number
}

Grade.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    order: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: 'grades',
    timestamps: true,
  }
)
