import { Kysely, Migration, MigrationProvider, MysqlDialect, sql } from 'kysely'
import { Database } from './index'
import communities_v6 from '../../input/communities_v6.json'

export const VERSION = 6;
const communities: { nodes: { community: string, size: number, prefix: string }[] } = communities_v6 as any;

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
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

migrations['002'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('likescore')
      .ifNotExists()
      .addColumn('author', 'varchar(255)', (col) => col.notNull())
      .addColumn('subject', 'varchar(255)', (col) => col.notNull())
      .addPrimaryKeyConstraint('primary_key', ['author', 'subject'])
      .addColumn('score', 'integer', (col) => col.notNull())
      .execute();
    try {
      await db.schema
        .createIndex('idx_likescore_to_score')
        .on('likescore')
        .column('score')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_likescore_to_score, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('likescore').execute()
    await db.schema.dropIndex('idx_likescore_to_score').execute();
  },
}

migrations['003'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('feed_usage')
      .ifNotExists()
      .addColumn('user', 'varchar(255)', (col) => col.notNull())
      .addColumn('feed', 'varchar(16)', (col) => col.notNull())
      .addColumn('limit', 'integer', (col) => col.notNull())
      .addColumn('refreshcount', 'integer', (col) => col.notNull())
      .addColumn('lastUpdated', 'varchar(255)', (col) => col.notNull())
      .addColumn('last_post_output', 'integer')
      .addPrimaryKeyConstraint('primary_key', ['user', 'feed', 'limit'])
      .execute();
    try {
      await db.schema
        .createIndex('idx_feed_usage_to_refreshcount')
        .on('feed_usage')
        .column('refreshcount')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_usage_to_refreshcount, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_feed_usage_to_lastupdated')
        .on('feed_usage')
        .column('lastUpdated')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_usage_to_lastupdated, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('feed_usage').execute()
  },
};

migrations['004'] = {
  async up(db: Database) {
    await sql`SET PERSIST sql_mode=(SELECT REPLACE(@@sql_mode,'ONLY_FULL_GROUP_BY',''))`.execute(db);
  }
};

migrations['005'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('feed_overrides')
      .ifNotExists()
      .addColumn('user', 'varchar(255)', (col) => col.notNull())
      .addColumn('feed', 'varchar(16)', (col) => col.notNull())
      .addColumn('optout', 'boolean', (col) => col.defaultTo(false))
      .addColumn('did_exclude', 'json')
      .addColumn('hide_replies', 'boolean')
      .addColumn('hide_follows', 'boolean')
      .addColumn('home_communities', 'integer')
      .addColumn('discover_communities', 'integer')
      .addColumn('discover_rate', 'integer')
      .addColumn('follows_rate', 'integer')
      .addColumn('version', 'int4')
      .addColumn('c_include', 'json')
      .addColumn('c_exclude', 'json')
      .addPrimaryKeyConstraint('primary_key', ['user', 'feed'])
      .execute();
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('feed_overrides').execute()
  },
};

migrations['006'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('bot_commands')
      .ifNotExists()
      .addColumn('user', 'varchar(255)', (col) => col.notNull())
      .addColumn('uri', 'varchar(255)', (col) => col.notNull())
      .addColumn('command', 'varchar(255)', (col) => col.notNull())
      .addColumn('value', 'varchar(255)')
      .addColumn('status', sql`enum('created', 'processing', 'finished', 'error')`, (col) => col.notNull())
      .addColumn('createdAt', 'varchar(255)', (col) => col.notNull())
      .addPrimaryKeyConstraint('primary_key', ['user', 'uri'])
      .execute();
    try {
      await db.schema
        .createIndex('idx_bot_commands_command')
        .on('post')
        .column('command')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_bot_commands_command, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_bot_commands_status')
        .on('post')
        .column('status')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_bot_commands_status, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('bot_commands').execute();
    await db.schema.dropIndex('idx_bot_commands_command').execute();
  },
};

// version update

migrations['007'] = {
  async up(db: Kysely<MysqlDialect>) {
    await db.schema
      .createTable('post')
      .ifNotExists()
      .addColumn('uri', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('version', 'int4', (col) => col.notNull())
      .addColumn('cid', 'varchar(255)', (col) => col.notNull())
      .addColumn('author', 'varchar(255)', (col) => col.notNull())
      .addColumn('replyParent', 'varchar(255)')
      .addColumn('replyRoot', 'varchar(255)')
      .addColumn('indexedAt', 'varchar(255)', (col) => col.notNull())
      .addColumn('f', 'varchar(255)')
      .addColumn('s', 'varchar(255)')
      .addColumn('c', 'varchar(255)')
      .addColumn('g', 'varchar(255)')
      .addColumn('e', 'varchar(255)')
      .addColumn('o', 'varchar(255)')
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
      .addColumn('version', 'int4', (col) => col.notNull())
      .addColumn('size', 'int4', (col) => col.notNull())
      .addColumn('prefix', 'varchar(4)', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('did_to_community')
      .ifNotExists()
      .addColumn('did', 'varchar(255)', (col) => col.primaryKey())
      .addColumn('version', 'int4', (col) => col.notNull())
      .addColumn('f', 'varchar(255)')
      .addColumn('s', 'varchar(255)')
      .addColumn('c', 'varchar(255)')
      .addColumn('g', 'varchar(255)')
      .addColumn('e', 'varchar(255)')
      .addColumn('o', 'varchar(255)')
      .execute();

    try {
      await db.schema
        .createIndex('idx_version_to_post')
        .on('post')
        .column('version')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_version_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_version_to_community')
        .on('community')
        .column('version')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_version_to_community, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_version_to_did')
        .on('did_to_community')
        .column('version')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_version_to_did, already exists`);
    }
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
    try {
      await db.schema
        .createIndex('idx_gigaclusters_to_post')
        .on('post')
        .column('f')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_gigaclusters_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_superclusters_to_post')
        .on('post')
        .column('s')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_superclusters_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_clusters_to_post')
        .on('post')
        .column('c')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_clusters_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_galaxies_to_post')
        .on('post')
        .column('g')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_galaxies_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_nebulas_to_post')
        .on('post')
        .column('o')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_nebulas_to_post, already exists`);
    }
    try {
      await db.schema
        .createIndex('idx_constellations_to_post')
        .on('post')
        .column('e')
        .execute();
    } catch (err) {
      console.log(`Skipping index idx_constellations_to_post, already exists`);
    }
  },
  async down(db: Kysely<MysqlDialect>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropIndex('idx_version_to_post').execute()
    await db.schema.dropIndex('idx_gigaclusters_to_post').execute()
    await db.schema.dropIndex('idx_superclusters_to_post').execute()
    await db.schema.dropIndex('idx_clusters_to_post').execute()
    await db.schema.dropIndex('idx_galaxies_to_post').execute()
    await db.schema.dropIndex('idx_nebulas_to_post').execute()
    await db.schema.dropIndex('idx_constellations_to_post').execute()
    await db.schema.dropTable('sub_state').execute()
    await db.schema.dropIndex('idx_post_by_did').execute()
    await db.schema.dropTable('community').execute()
    await db.schema.dropIndex('idx_version_to_community').execute()
    await db.schema.dropTable('did_to_community').execute()
    await db.schema.dropIndex('idx_version_to_did').execute()
    await db.schema.dropIndex('idx_gigaclusters_to_did').execute()
    await db.schema.dropIndex('idx_superclusters_to_did').execute()
    await db.schema.dropIndex('idx_clusters_to_did').execute()
    await db.schema.dropIndex('idx_galaxies_to_did').execute()
    await db.schema.dropIndex('idx_nebulas_to_did').execute()
    await db.schema.dropIndex('idx_constellations_to_did').execute()
  },
}


migrations['008'] = {
  async up(db: Database) {
    communities.nodes.forEach(async (community, i) => {
      const communityCode = community.community;
      await db.insertInto('community')
        .values({
          community: communityCode,
          version: VERSION,
          size: community.size,
          prefix: community.prefix
        })
        .ignore()
        .execute();
    })
  }
};

migrations['009'] = {
  async up(db: Database) {
    await sql`LOAD DATA INFILE '/var/lib/mysql-files/did_to_communities.csv' INTO TABLE did_to_community FIELDS TERMINATED BY ',' lines terminated BY '\n' IGNORE 1 LINES`.execute(db);
  }
};

migrations['010'] = {
  async up(db: Database) {
    await sql`CREATE EVENT if not exists
    ClearPosts
  ON SCHEDULE EVERY 1 DAY
  DO
  DELETE p, r FROM post p
  JOIN postrank r on p.uri = r.uri
  WHERE (r.score < 10 and p.indexedAt < DATE_SUB(NOW(), INTERVAL 1 DAY))
  OR p.indexedAt < DATE_SUB(NOW(), INTERVAL 3 DAY)`.execute(db);
  }
};

migrations['011'] = {
  async up(db: Database) {
    //not using that anymore
    await sql`drop event if exists ClearPosts`.execute(db);
    await sql`CREATE EVENT if not exists
    ClearBinlogs
    ON SCHEDULE EVERY 1 DAY
    DO
    PURGE BINARY LOGS BEFORE DATE_SUB(now(), interval 3 day)`.execute(db);
  }
};

// adding people to communities on the fly
// migrations['011'] = {
//   async up(db: Kysely<MysqlDialect>) {
//     await db.schema
//       .alterTable('community_likescore')
//       .addColumn('version', 'varchar(4)')
//       .addColumn('from_f', 'varchar(16)')
//       .addColumn('from_s', 'varchar(16)')
//       .addColumn('from_c', 'varchar(16)')
//       .addColumn('from_g', 'varchar(16)')
//       .addColumn('from_e', 'varchar(16)')
//       .addColumn('from_o', 'varchar(16)')
//       .addColumn('to_f', 'varchar(16)')
//       .addColumn('to_s', 'varchar(16)')
//       .addColumn('to_c', 'varchar(16)')
//       .addColumn('to_g', 'varchar(16)')
//       .addColumn('to_e', 'varchar(16)')
//       .addColumn('to_o', 'varchar(16)')
//       .execute();

//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_f')
//         .on('likescore')
//         .column('from_f')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_f, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_s')
//         .on('likescore')
//         .column('from_s')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_s, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_c')
//         .on('likescore')
//         .column('from_c')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_c, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_g')
//         .on('likescore')
//         .column('from_g')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_g, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_e')
//         .on('likescore')
//         .column('from_e')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_e, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_from_o')
//         .on('likescore')
//         .column('from_o')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_from_o, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_f')
//         .on('likescore')
//         .column('to_f')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_f, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_s')
//         .on('likescore')
//         .column('to_s')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_s, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_c')
//         .on('likescore')
//         .column('to_c')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_c, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_g')
//         .on('likescore')
//         .column('to_g')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_g, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_e')
//         .on('likescore')
//         .column('to_e')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_e, already exists`);
//     }
//     try {
//       await db.schema
//         .createIndex('idx_likescore_to_to_o')
//         .on('likescore')
//         .column('to_o')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_likescore_to_to_o, already exists`);
//     }

//     await sql`UPDATE likescore set version='v4' where version is null`.execute(db);
//   },
//   async down(db: Kysely<MysqlDialect>) {
//     await db.schema.alterTable('likescore').dropColumn('from_f').execute();
//     await db.schema.alterTable('likescore').dropColumn('from_s').execute();
//     await db.schema.alterTable('likescore').dropColumn('from_c').execute();
//     await db.schema.alterTable('likescore').dropColumn('from_g').execute();
//     await db.schema.alterTable('likescore').dropColumn('from_e').execute();
//     await db.schema.alterTable('likescore').dropColumn('from_o').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_f').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_s').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_c').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_g').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_e').execute();
//     await db.schema.alterTable('likescore').dropColumn('to_o').execute();
//     await db.schema.dropIndex("idx_likescore_to_from_f").execute();
//     await db.schema.dropIndex("idx_likescore_to_from_s").execute();
//     await db.schema.dropIndex("idx_likescore_to_from_c").execute();
//     await db.schema.dropIndex("idx_likescore_to_from_g").execute();
//     await db.schema.dropIndex("idx_likescore_to_from_e").execute();
//     await db.schema.dropIndex("idx_likescore_to_from_o").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_f").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_s").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_c").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_g").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_e").execute();
//     await db.schema.dropIndex("idx_likescore_to_to_o").execute();
//   },
// };

// migrations['012'] = {
//   async up(db: Kysely<MysqlDialect>) {
//     await db.schema
//       .createTable('handlesearch')
//       .ifNotExists()
//       .addColumn('handle', 'varchar(255)', (col) => col.notNull())
//       .addColumn('did', 'varchar(255)', (col) => col.notNull())
//       .addPrimaryKeyConstraint('primary_key', ['did', 'handle'])
//       .execute();
//     try {
//       await sql`ALTER TABLE handlesearch ADD FULLTEXT INDEX 'idx_handlesearch_to_handle_ft'(handle)`.execute(db);
//     } catch (err) {
//       console.log(`Skipping index idx_handlesearch_to_handle_ft, already exists`);
//     }
//     await sql`LOAD DATA INFILE '/var/lib/mysql-files/handles.csv' IGNORE INTO TABLE handlesearch FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' lines terminated BY '\n'`.execute(db);
//   },
//   async down(db: Kysely<MysqlDialect>) {
//     await db.schema.dropTable('handlesearch').execute()
//     await db.schema.dropIndex('idx_handlesearch_to_handle_ft').execute()
//   },
// };

// migrations['013'] = {
//   async up(db: Kysely<MysqlDialect>) {
//     await db.schema
//       .alterTable('handlesearch')
//       .addColumn('prefix3', 'varchar(3)')
//       .execute();

//     try {
//       await db.schema
//         .createIndex('idx_handlesearch_to_prefix3')
//         .on('handlesearch')
//         .column('prefix3')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_handlesearch_to_prefix3, already exists`);
//     }

//     await sql`update handlesearch h set h.prefix3 = SUBSTRING(h.handle, 1, 3) where prefix3 is null`.execute(db);
//   },
//   async down(db: Kysely<MysqlDialect>) {
//     await db.schema.alterTable('handlesearch').dropColumn('prefix3').execute();
//     await db.schema.dropIndex('idx_handlesearch_to_prefix3').execute();
//   },
// };

// migrations['014'] = {
//   async up(db: Kysely<MysqlDialect>) {
//     try {
//       await db.schema
//         .createIndex('idx_handlesearch_to_handle')
//         .on('handlesearch')
//         .column('handle')
//         .execute();
//     } catch (err) {
//       console.log(`Skipping index idx_handlesearch_to_handle, already exists`);
//     }
//   },
//   async down(db: Kysely<MysqlDialect>) {
//     await db.schema.dropIndex('idx_handlesearch_to_handle').execute();
//   },
// };