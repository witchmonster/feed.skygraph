import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as whatsAlf from './feeds/consistent'
import * as mygalaxyplus from './feeds/mygalaxyplus'
import * as mynebulaplus from './feeds/mynebulaplus'
import * as dynamic from './feeds/dynamic'

type AlgoHandler = (ctx: AppContext, params: QueryParams, userDid?: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [mygalaxyplus.shortname]: mygalaxyplus.handler,
  [mynebulaplus.shortname]: mynebulaplus.handler,
  [whatsAlf.shortname]: whatsAlf.handler,
  [dynamic.shortname]: dynamic.handler,
}

export default algos
