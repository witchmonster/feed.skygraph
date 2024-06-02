import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { MyCommunityPlusTemplateConfig, generateCommunityPlusFeed } from '../templates/mycommunityplus'

export const shortname = 't_galaxy'

export const config: MyCommunityPlusTemplateConfig = {
  shortName: shortname,
  feedName: "My Galaxy+ (test)",
  //first page
  firstPageHNGravity: 4,
  firstPageReplyRatio: 0.2,
  firstPageMinQuality: 5,
  firstPageCommunities: 7,
  firstPageFollowsRate: 5,
  firstPagePostLookupMultiplier: 20,
  firstPageRandomizeWithinRateLimit: false,
  //main feed
  homeHNGravity: 4,
  homeSkipReplies: false,
  homeCommunities: 7,
  homeFollowsRate: 5,
  homePostLookupMultiplier: 3,
  homeRandomizeWithinRateLimit: false,
  //discover mix in
  discoverHNGravity: 3,
  discoverSkipReplies: true,
  discoverCommunities: 10,
  discoverPostsRate: 5,
  discoverRandomizeWithinRateLimit: false,
  //input communities
  communityConfig: {
    mode: "nebula",
    totalCommunities: 10,
    trustedFriendsLimit: 5,
    feed: "skygraph"
  }
}

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
  return generateCommunityPlusFeed({ ctx, params, userDid, follows }, config)
}

