import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as whatsAlf from './feeds/consistent'
import * as skygraph from './feeds/mynebulaplus'
import * as dynamic from './feeds/dynamic'

type AlgoHandler = (ctx: AppContext, params: QueryParams, userDid?: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [whatsAlf.shortname]: whatsAlf.handler,
  [skygraph.shortname]: skygraph.handler,
  [dynamic.shortname]: dynamic.handler,
}

export default algos
