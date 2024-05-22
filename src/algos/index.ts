import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as test_mygalaxyplus from './feeds/test_mygalaxyplus'
import * as test_mynebulaplus from './feeds/test_mynebulaplus'
import * as mygalaxyplus from './feeds/mygalaxyplus'
import * as mynebulaplus from './feeds/mynebulaplus'

type AlgoHandler = (ctx: AppContext, params: QueryParams, userDid?: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [mygalaxyplus.shortname]: mygalaxyplus.handler,
  [mynebulaplus.shortname]: mynebulaplus.handler,
  [test_mygalaxyplus.shortname]: test_mygalaxyplus.handler,
  [test_mynebulaplus.shortname]: test_mynebulaplus.handler,
}

export default algos
