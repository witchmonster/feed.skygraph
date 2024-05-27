import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getFirstPagePosts, getRankedPosts, CommunityRequestConfig, CommunityResponse, getUserCommunities } from '../common/communities'
import { mergePosts, rateLimit, shuffleRateLimitTrim } from '../common/util'
import { mixInFollows } from '../common/follows'
import { recordUsage } from '../common/stats'

// max 15 chars
export const shortname = 'skygraph'
const feedName = "My Galaxy+"

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
  console.log(`User ${userDid} from ${feedName} feed`);

  await recordUsage(ctx, userDid, shortname, params.limit);

  let seed: number;
  let existingRank1;
  let existingRank2;
  let existingfollowsCursor;
  if (params.cursor) {
    const [passedSeed, rank1, rank2, timestamp] = params.cursor.split('::')
    existingRank1 = rank1;
    existingRank2 = rank2;
    existingfollowsCursor = timestamp;
    if (!passedSeed || !rank1) {
      throw new InvalidRequestError('malformed cursor')
    }
    seed = +passedSeed;
  } else {
    seed = new Date().getUTCMilliseconds();
  }

  console.log(`${seed}::${existingRank1}::${existingRank2}::${existingfollowsCursor}`);

  const communityConfig: CommunityRequestConfig = {
    mode: "nebula",
    withTopLiked: true,
    withExplore: true,
    topLikedLimit: 5,
    trustedFriendsLimit: 5
  };
  let res: any;
  let lastRank1;
  let lastRank2;
  let followsRate;
  const communityResponse: CommunityResponse = await getUserCommunities(ctx, userDid, communityConfig);
  const communityResponseWithoutExplore = { ...communityResponse, exploreCommunitiesByLikes: { communities: [], prefix: communityResponse.exploreCommunitiesByLikes.prefix } };
  if (!existingRank1 || !existingRank2) {
    res = await getFirstPagePosts(ctx, { withExplore: false, seed, gravity: 3, limit: params.limit * 3 }, communityResponse);
    lastRank1 = 99999999;
    lastRank2 = 99999999;
    //turn off
    followsRate = params.limit;
  } else {
    res = await getRankedPosts(ctx, { existingRank: existingRank1, withExplore: false, skipReplies: false, gravity: 4, limit: params.limit * 2 }, communityResponseWithoutExplore);
    lastRank1 = res?.at(-1).rank;
    const res2: any = await getRankedPosts(ctx, { existingRank: existingRank2, withExplore: true, skipReplies: true, gravity: 3, limit: params.limit * 2 }, communityResponse);
    lastRank2 = res2?.at(-1).rank;
    res = await mergePosts(seed, 3, rateLimit(res), rateLimit(res2));
    followsRate = 5;
  }

  const shuffledPosts = shuffleRateLimitTrim(res, params.limit);

  const { followsCursor, resultPosts } = await mixInFollows(ctx, followsRate, existingfollowsCursor, params.limit, seed, shuffledPosts, follows);

  const feed = resultPosts.map((row) => ({
    post: row.uri
  }))

  const cursor = `${seed}::${lastRank1}::${lastRank2}::${followsCursor}`;
  // console.log({ feed, cursor })

  return {
    cursor,
    feed,
  }
}
