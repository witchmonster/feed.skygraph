import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { MyCommunityPlusTemplateConfig, generateCommunityPlusFeed } from '../templates/mycommunityplus'

export const shortname = 'nebula_plus'

export const config: MyCommunityPlusTemplateConfig = {
    shortName: shortname,
    feedName: "My Nebula+",
    //first page
    firstPageHNGravity: 4,
    firstPageReplyRatio: 0.2,
    firstPageHomeMinQuality: 3,
    firstPageDiscoverMinQuality: 10,
    firstPagePostLookupMultiplier: 20,
    firstPageRandomizeWithinRateLimit: false,
    //follows mix in
    followsPostsRate: 5,
    //home feed
    homeHNGravity: 4,
    homeSkipReplies: false,
    homeCommunities: 12,
    homePostLookupMultiplier: 2,
    homeRandomizeWithinRateLimit: false,
    //discover mix in
    discoverHNGravity: 3,
    discoverSkipReplies: true,
    discoverCommunities: 10,
    discoverPostsRate: 10,
    discoverRandomizeWithinRateLimit: false,
    //input communities
    mode: "constellation",
    trustedFriendsLimit: 5,
    feedKey: "nebula_plus"
};

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
    return generateCommunityPlusFeed({ ctx, params, userDid, follows }, config)
}