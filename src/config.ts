import AtpAgent from '@atproto/api'
import { Database } from './db'
import { DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  agent: AtpAgent
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  serviceDid: string
  publisherDid: string
}

export type IndexerConfig = {
  // sqliteLocation: string
  subscriptionEndpoint: string
  subscriptionReconnectDelay: number
}