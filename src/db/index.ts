import { createPool } from 'mysql2'
import { Kysely, Migrator, MysqlDialect } from 'kysely'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

export const createDb = (): Database => {
  return new Kysely<DatabaseSchema>({
    dialect:
      new MysqlDialect({
        pool: async () => createPool({
          database: 'skygraph',
          host: 'localhost',
          user: 'root',
          password: 'skygraph'
        })
      })
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>
