import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'
import { InventoryItem } from './InventoryItem'

export interface ItemRecordAttributes {
  id: number
  itemName: string
  inventoryItemId: number | null
  studentId: number
  quantity: number
  issuedDate: string
  notes: string | null
}

type ItemRecordCreationAttributes = Optional<ItemRecordAttributes, 'id' | 'inventoryItemId' | 'quantity' | 'notes'>

export class ItemRecord extends Model<ItemRecordAttributes, ItemRecordCreationAttributes> implements ItemRecordAttributes {
  declare id: number
  declare itemName: string
  declare inventoryItemId: number | null
  declare studentId: number
  declare quantity: number
  declare issuedDate: string
  declare notes: string | null
}

ItemRecord.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    itemName: { type: DataTypes.STRING(150), allowNull: false },
    inventoryItemId: { type: DataTypes.INTEGER, allowNull: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    issuedDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'item_records',
    timestamps: true,
  }
)

ItemRecord.belongsTo(User, { foreignKey: 'studentId', as: 'student' })
ItemRecord.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'inventoryItem' })
