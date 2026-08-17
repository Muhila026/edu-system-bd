import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'

export type SchoolItemType =
  | 'Report Card'
  | 'Communication Book'
  | 'Uniform Set'
  | 'Cap'
  | 'Badge'
  | 'Tie'
  | 'Uniform Package (Bundle)'

export interface InventoryItemAttributes {
  id: number
  /** One of the fixed SchoolItemType names, or a custom admin-defined package name. */
  name: string
  price: number
  isPackage: boolean
  packageItems: string | null // JSON-encoded string[] of item names, when isPackage is true
  /** Units currently in stock. Decremented every time this item is issued (paid or free). Null = untracked/unlimited. */
  stockQuantity: number | null
}

type InventoryItemCreationAttributes = Optional<
  InventoryItemAttributes,
  'id' | 'isPackage' | 'packageItems' | 'stockQuantity'
>

export class InventoryItem
  extends Model<InventoryItemAttributes, InventoryItemCreationAttributes>
  implements InventoryItemAttributes
{
  declare id: number
  declare name: string
  declare price: number
  declare isPackage: boolean
  declare packageItems: string | null
  declare stockQuantity: number | null
}

InventoryItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    isPackage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    packageItems: { type: DataTypes.TEXT, allowNull: true },
    stockQuantity: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 100 },
  },
  {
    sequelize,
    tableName: 'inventory_items',
    timestamps: true,
  }
)
