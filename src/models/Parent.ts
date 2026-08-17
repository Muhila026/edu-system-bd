import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'

export interface ParentAttributes {
  id: number
  userId: number
  occupation: string | null
  address: string | null
  emergencyContact: string | null
}

type ParentCreationAttributes = Optional<ParentAttributes, 'id' | 'occupation' | 'address' | 'emergencyContact'>

export class Parent extends Model<ParentAttributes, ParentCreationAttributes> implements ParentAttributes {
  declare id: number
  declare userId: number
  declare occupation: string | null
  declare address: string | null
  declare emergencyContact: string | null
}

Parent.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    occupation: { type: DataTypes.STRING(150), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    emergencyContact: { type: DataTypes.STRING(50), allowNull: true },
  },
  {
    sequelize,
    tableName: 'parent_profiles',
    timestamps: true,
  }
)

Parent.belongsTo(User, { foreignKey: 'userId', as: 'user' })
User.hasOne(Parent, { foreignKey: 'userId', as: 'parentProfile' })
