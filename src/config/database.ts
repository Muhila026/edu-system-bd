import { Sequelize } from 'sequelize'
import dotenv from 'dotenv'

dotenv.config()

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT || 3306)
const DB_NAME = process.env.DB_NAME || 'school_management'
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''

export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql',
  logging: false,
})

/** Creates the target database itself if it doesn't exist yet (before Sequelize connects to it). */
export async function ensureDatabaseExists(): Promise<void> {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  })
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
  await connection.end()
}
