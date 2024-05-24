import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getFirstPagePosts, getRankedPosts, CommunityRequestConfig, getRankomizedPosts } from '../common/communities'
import { mixInPosts, rateLimit as rateLimit, shuffleArray, shuffleRateLimitTrim } from '../common/util'
import { mixInFollows } from '../common/follows'

// max 15 chars
export const shortname = 'test'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
  console.log(`User ${userDid} from test_mynebulaplus feed`);

  let seed: number;
  let existingRank;
  let existingfollowsCursor;
  if (params.cursor) {
    const [passedSeed, rank, timestamp] = params.cursor.split('::')
    existingRank = rank;
    existingfollowsCursor = timestamp;
    if (!passedSeed || !rank) {
      throw new InvalidRequestError('malformed cursor')
    }
    seed = +passedSeed;
  } else {
    seed = new Date().getUTCMilliseconds();
  }

  console.log(`${seed}::${existingRank}::${existingfollowsCursor}`);

  const communityConfig: CommunityRequestConfig = {
    mode: "nebula",
    withTopLiked: true,
    withExplore: true,
    topLikedLimit: 8,
    trustedFriendsLimit: 5
  };
  let res;
  let lastRank;
  if (!existingRank) {
    res = await getFirstPagePosts(ctx, params.limit * 2, userDid, communityConfig);
    lastRank = 99999999;
  } else {
    res = await getRankedPosts(ctx, existingRank, params.limit, 3, userDid, communityConfig);
    const res2: any = await getRankomizedPosts(ctx, existingRank, params.limit, 4, userDid, communityConfig);
    await mixInPosts(seed, 2, res, res2)
    lastRank = res.at(-1)?.rank;
  }

  const shuffledPosts = shuffleRateLimitTrim(res, params.limit);

  const { followsCursor, resultPosts } = await mixInFollows(ctx, existingfollowsCursor, params.limit, seed, shuffledPosts, follows);

  const feed = resultPosts.map((row) => ({
    post: row.uri,
  }))

  return {
    cursor: `${seed}::${lastRank}::${followsCursor}`,
    feed,
  }
}
