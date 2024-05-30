import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { generateCommunityPlusFeed } from '../templates/mycommunityplus'

export const shortname = 't_nebula'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
    return generateCommunityPlusFeed({ ctx, params, userDid, follows }, {
        shortName: shortname,
        feedName: "test 2",
        //first page
        firstPageHNGravity: 4,
        firstPageReplyRatio: 0.2,
        firstPageMinQuality: 3,
        firstPageCommunities: 10,
        firstPageFollowsRate: 5,
        firstPagePostLookupMultiplier: 20,
        firstPageRandomizeWithinRateLimit: true,
        //main feed
        homeHNGravity: 4,
        homeSkipReplies: false,
        homeCommunities: 10,
        homeFollowsRate: 5,
        homePostLookupMultiplier: 2,
        homeRandomizeWithinRateLimit: true,
        //discover mix in
        discoverHNGravity: 3,
        discoverSkipReplies: true,
        discoverCommunities: 16,
        discoverPostsRate: 10,
        discoverRandomizeWithinRateLimit: true,
        //input communities
        communityConfig: {
            mode: "constellation",
            totalCommunities: 16,
            trustedFriendsLimit: 5
        }
    })
}