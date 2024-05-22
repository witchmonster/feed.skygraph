import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as whatsAlf from './whats-alf'
import * as dynamic from './dynamic'

type AlgoHandler = (ctx: AppContext, params: QueryParams, userDid?: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [whatsAlf.shortname]: whatsAlf.handler,
  [dynamic.shortname]: dynamic.handler,
}

export default algos
