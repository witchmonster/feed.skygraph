import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { IndexerConfig } from './config'

export class Indexer {
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: IndexerConfig

  constructor(
    db: Database,
    firehose: FirehoseSubscription,
    cfg: IndexerConfig,
  ) {
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
  }

  static create(cfg: IndexerConfig) {
    const db = createDb()
    const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint)

    return new Indexer(db, firehose, cfg)
  }

  async start(): Promise<void> {
    await migrateToLatest(this.db)
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    return;
  }
}

export default Indexer
