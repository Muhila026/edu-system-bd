import { DataTypes, Model, Optional } from 'sequelize'
import { sequelize } from '../config/database'
import { User } from './User'

export interface TeacherProfileAttributes {
  id: number
  userId: number
  employeeCode: string | null
  qualification: string | null
  subjectSpecialization: string | null
  joiningDate: string | null
  department: string | null
}

type TeacherProfileCreationAttributes = Optional<
  TeacherProfileAttributes,
  'id' | 'employeeCode' | 'qualification' | 'subjectSpecialization' | 'joiningDate' | 'department'
>

export class TeacherProfile
  extends Model<TeacherProfileAttributes, TeacherProfileCreationAttributes>
  implements TeacherProfileAttributes
{
  declare id: number
  declare userId: number
  declare employeeCode: string | null
  declare qualification: string | null
  declare subjectSpecialization: string | null
  declare joiningDate: string | null
  declare department: string | null
}

TeacherProfile.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    employeeCode: { type: DataTypes.STRING(50), allowNull: true, unique: true },
    qualification: { type: DataTypes.STRING(100), allowNull: true },
    subjectSpecialization: { type: DataTypes.STRING(150), allowNull: true },
    joiningDate: { type: DataTypes.DATEONLY, allowNull: true },
    department: { type: DataTypes.STRING(150), allowNull: true },
  },
  {
    sequelize,
    tableName: 'teacher_profiles',
    timestamps: true,
  }
)

TeacherProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' })
User.hasOne(TeacherProfile, { foreignKey: 'userId', as: 'teacherProfile' })
