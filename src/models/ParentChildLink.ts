import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'

export type GuardianRelationship = 'Father' | 'Mother' | 'Guardian'

export interface ParentChildLinkAttributes {
  id: number
  parentUserId: number
  studentUserId: number
  relationship: GuardianRelationship
}

type ParentChildLinkCreationAttributes = Optional<ParentChildLinkAttributes, 'id' | 'relationship'>

export class ParentChildLink
  extends Model<ParentChildLinkAttributes, ParentChildLinkCreationAttributes>
  implements ParentChildLinkAttributes
{
  declare id: number
  declare parentUserId: number
  declare studentUserId: number
  declare relationship: GuardianRelationship
}

ParentChildLink.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    parentUserId: { type: DataTypes.INTEGER, allowNull: false },
    studentUserId: { type: DataTypes.INTEGER, allowNull: false },
    relationship: { type: DataTypes.ENUM('Father', 'Mother', 'Guardian'), allowNull: false, defaultValue: 'Guardian' },
  },
  {
    sequelize,
    tableName: 'parent_child_links',
    timestamps: true,
    indexes: [{ unique: true, fields: ['parentUserId', 'studentUserId'] }],
  }
)

ParentChildLink.belongsTo(User, { foreignKey: 'parentUserId', as: 'parent' })
ParentChildLink.belongsTo(User, { foreignKey: 'studentUserId', as: 'student' })
