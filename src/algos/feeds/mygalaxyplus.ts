import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { generateCommunityPlusFeed } from '../templates/mycommunityplus'

export const shortname = 'skygraph'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
  return generateCommunityPlusFeed({ ctx, params, userDid, follows }, {
    shortName: shortname,
    feedName: "My Galaxy+",
    //first page
    firstPageHNGravity: 4,
    firstPageReplyRatio: 0.2,
    firstPageMinQuality: 3,
    firstPageCommunities: 5,
    firstPageFollowsRate: 5,
    firstPagePostLookupMultiplier: 20,
    firstPageRandomizeWithinRateLimit: true,
    //main feed
    homeHNGravity: 4,
    homeSkipReplies: false,
    homeCommunities: 5,
    homeFollowsRate: 5,
    homePostLookupMultiplier: 3,
    homeRandomizeWithinRateLimit: true,
    //discover mix in
    discoverHNGravity: 3,
    discoverSkipReplies: true,
    discoverCommunities: 7,
    discoverPostsRate: 5,
    discoverRandomizeWithinRateLimit: true,
    //input communities
    communityConfig: {
      mode: "nebula",
      totalCommunities: 7,
      trustedFriendsLimit: 5
    }
  })
}
