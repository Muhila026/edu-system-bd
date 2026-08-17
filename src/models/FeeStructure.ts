import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { AcademicYear } from './AcademicYear'
import { Grade } from './Grade'
import { Term } from './Term'

export type FeeType =
  | 'School Fee'
  | 'Admission Fee'
  | 'Term 1 Exam Fee'
  | 'Term 2 Exam Fee'
  | 'Term 3 Exam Fee'
  | 'Event/Activity Fee'
  | 'After-School Class Admission Fee'

export interface FeeStructureAttributes {
  id: number
  feeType: FeeType
  title: string
  description: string | null
  amount: number
  dueDate: string | null
  /** Grade/term-scoped fees (School Fee, Term Exam Fees) set these; Admission/Event/After-School
   *  Admission fees are school-wide and leave them null. */
  academicYearId: number | null
  gradeId: number | null
  termId: number | null
  /** True when this fee structure is a bundle of other fee structures (e.g. "New Admission Package"). */
  isPackage: boolean
  /** JSON-encoded string[] of member fee_structures.id when isPackage=true. */
  packageItems: string | null
}

type FeeStructureCreationAttributes = Optional<
  FeeStructureAttributes,
  'id' | 'description' | 'dueDate' | 'academicYearId' | 'gradeId' | 'termId' | 'isPackage' | 'packageItems'
>

export class FeeStructure
  extends Model<FeeStructureAttributes, FeeStructureCreationAttributes>
  implements FeeStructureAttributes
{
  declare id: number
  declare feeType: FeeType
  declare title: string
  declare description: string | null
  declare amount: number
  declare dueDate: string | null
  declare academicYearId: number | null
  declare gradeId: number | null
  declare termId: number | null
  declare isPackage: boolean
  declare packageItems: string | null
}

FeeStructure.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    feeType: {
      type: DataTypes.ENUM(
        'School Fee',
        'Admission Fee',
        'Term 1 Exam Fee',
        'Term 2 Exam Fee',
        'Term 3 Exam Fee',
        'Event/Activity Fee',
        'After-School Class Admission Fee'
      ),
      allowNull: false,
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    academicYearId: { type: DataTypes.INTEGER, allowNull: true },
    gradeId: { type: DataTypes.INTEGER, allowNull: true },
    termId: { type: DataTypes.INTEGER, allowNull: true },
    isPackage: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    packageItems: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'fee_structures',
    timestamps: true,
  }
)

FeeStructure.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' })
FeeStructure.belongsTo(Grade, { foreignKey: 'gradeId', as: 'grade' })
FeeStructure.belongsTo(Term, { foreignKey: 'termId', as: 'term' })
