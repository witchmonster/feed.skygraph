import { Kysely, Migration, MigrationProvider, MysqlDialect, sql } from 'kysely'
import { Database } from './index'
import communities from '../../input/communities.json'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('post')
      .ifNotExists()
      .addColumn('uri', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('cid', 'varchar(255)', (col) => col.notNull())
      .addColumn('author', 'varchar(255)', (col) => col.notNull())
      .addColumn('replyParent', 'varchar(255)')
      .addColumn('replyRoot', 'varchar(255)')
      .addColumn('indexedAt', 'varchar(255)', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('sub_state')
      .ifNotExists()
      .addColumn('service', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute();

    try {
      await db.schema
        .createIndex('idx_post_by_did')
        .on('post')
        .column('author')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_post_by_did, already exists`);
    }

    await db.schema
      .createTable('community')
      .ifNotExists()
      .addColumn('community', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('size', 'int4', (col) => col.notNull())
      .addColumn('prefix', 'varchar(4)', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('did_to_community')
      .ifNotExists()
      .addColumn('did', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('f', 'varchar(255)')
      .addColumn('s', 'varchar(255)')
      .addColumn('c', 'varchar(255)')
      .addColumn('g', 'varchar(255)')
      .addColumn('o', 'varchar(255)')
      .addColumn('e', 'varchar(255)')
      .execute();

    try {
      await db.schema
        .createIndex('idx_gigaclusters_to_did')
        .on('did_to_community')
        .column('f')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_gigaclusters_to_did, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_superclusters_to_did')
        .on('did_to_community')
        .column('s')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_superclusters_to_did, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_clusters_to_did')
        .on('did_to_community')
        .column('c')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_clusters_to_did, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_galaxies_to_did')
        .on('did_to_community')
        .column('g')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_galaxies_to_did, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_nebulas_to_did')
        .on('did_to_community')
        .column('o')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_nebulas_to_did, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_constellations_to_did')
        .on('did_to_community')
        .column('e')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_constellations_to_did, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropIndex('idx_post_by_did').execute()
    await db.schema.dropTable('community').execute()
    await db.schema.dropTable('did_to_community').execute()
    await db.schema.dropIndex('idx_gigaclusters_to_did').execute()
    await db.schema.dropIndex('idx_superclusters_to_did').execute()
    await db.schema.dropIndex('idx_clusters_to_did').execute()
    await db.schema.dropIndex('idx_galaxies_to_did').execute()
    await db.schema.dropIndex('idx_nebulas_to_did').execute()
    await db.schema.dropIndex('idx_constellations_to_did').execute()
  },
}


migrations['003'] = {
  async up(db: Database) {
    communities.nodes.forEach(async (community, i) => {
      const communityCode = community.community;
      // const getData = (): string[] => {
      //   try {
      //     console.log(`Reading file ${communityCode}.json, ${i} out of ${communities.nodes.length}`);
      //     return JSON.parse(fs.readFileSync(`./input/community/${communityCode}.json`, 'utf-8')).nodes[0].dids;
      //   } catch (err) {
      //     console.log(err);
      //     return [];
      //   }
      // }
      await db.insertInto('community')
        .values({
          community: communityCode,
          size: community.size,
          prefix: community.prefix
        })
        .ignore()
        .execute();
      // const getUpdate = (prefix: string, community: string) => {
      //   const row = {};
      //   row[prefix] = community;
      //   return row;
      // }
      // await db.insertInto('did_to_community')
      //   .values(
      //     getData().map(did => {
      //       let row: CommunityToDid = {
      //         did: did
      //       };
      //       row[community.prefix] = community.community;
      //       return row;
      //     })
      //   )
      //   .onDuplicateKeyUpdate(getUpdate(community.prefix, community.community))
      //   .execute();
    })
  }
};

migrations['004'] = {
  async up(db: Database) {
    await sql`LOAD DATA INFILE '/var/lib/mysql-files/did_to_communities.csv' INTO TABLE did_to_community FIELDS TERMINATED BY ',' lines terminated BY '\n'`.execute(db);
  }
};

migrations['005'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('likescore')
      .ifNotExists()
      .addColumn('author', 'varchar(255)', (col) => col.notNull())
      .addColumn('subject', 'varchar(255)', (col) => col.notNull())
      .addPrimaryKeyConstraint('primary_key', ['author', 'subject'])
      .addColumn('score', 'integer', (col) => col.notNull())
      .execute();
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('likescore').execute()
  },
}

migrations['006'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('postrank')
      .ifNotExists()
      .addColumn('uri', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('score', 'integer', (col) => col.notNull())
      .execute();
    try {
      await db.schema
        .createIndex('idx_postrank_to_score')
        .on('postrank')
        .column('score')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_postrank_to_score, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('postrank').execute()
  },
}


