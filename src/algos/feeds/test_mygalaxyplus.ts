import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { sql } from 'kysely'
import { getRankedPosts, getRankomizedPosts, getUserCommunities, getUserCommunity } from '../common/communities'
import { rateLimit } from '../common/util'

// max 15 chars
export const shortname = 'test'

function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string) => {
  console.log(`User ${userDid} from test_mygalaxyplus feed`);

  let seed: number;
  let existingRank;
  if (params.cursor) {
    const [passedSeed, rank] = params.cursor.split('::')
    existingRank = rank;
    if (!passedSeed || !rank) {
      throw new InvalidRequestError('malformed cursor')
    }
    seed = +passedSeed;
  } else {
    seed = new Date().getUTCMilliseconds();
  }

  console.log(`${seed}::${existingRank}`);

  const { communities, prefix } = await getUserCommunities(ctx, userDid, { withTopLiked: false });

  let res;
  if (!existingRank) {
    res = await getRankomizedPosts(ctx, params.limit, prefix, communities);
  } else {
    const rankingGravity = 3;
    res = await getRankedPosts(ctx, existingRank, params.limit, prefix, rankingGravity, communities);
  }

  console.log(`${res.length}`);
  shuffleArray(res);

  const rateLimitedRes = rateLimit(res);
  console.log(`rate limited to: ${rateLimitedRes.length}`);

  const feed = rateLimitedRes.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1);
  if (last) {
    cursor = `${seed}::${last.rank}`
  }

  return {
    cursor,
    feed,
  }
}
