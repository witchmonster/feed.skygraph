import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getFirstPagePosts, getRankedPosts, CommunityRequestConfig, CommunityResponse, getUserCommunities, sliceCommunityResponse } from '../common/communities'
import { mergePosts, rateLimit, shuffleRateLimitTrim } from '../common/util'
import { mergeWithFollows } from '../common/follows'
import { recordPostOutput, recordUsage } from '../common/stats'

interface FeedContext {
    ctx: AppContext;
    params: QueryParams;
    userDid: string;
    follows?: string[]
}

export interface MyCommunityPlusTemplateConfig {
    // max 15 chars
    shortName: string;
    feedName: string;
    //fist page
    firstPageHNGravity: number;
    firstPageReplyRatio: number;
    firstPageMinQuality: number;
    firstPageCommunities: number;
    firstPageFollowsRate: number;
    firstPagePostLookupMultiplier: number;
    firstPageRandomizeWithinRateLimit: boolean;
    //main feed
    homeHNGravity: number;
    homeSkipReplies: boolean;
    homeCommunities: number;
    homeFollowsRate: number;
    homePostLookupMultiplier: number;
    homeRandomizeWithinRateLimit: boolean;
    //discover mix in
    discoverHNGravity: number;
    discoverSkipReplies: boolean;
    discoverCommunities: number;
    discoverPostsRate: number;
    discoverRandomizeWithinRateLimit: boolean;
    //input communities
    communityConfig: CommunityRequestConfig;
}

export const generateCommunityPlusFeed = async (feedContext: FeedContext, config: MyCommunityPlusTemplateConfig) => {
    const { ctx, params, userDid, follows } = feedContext;

    console.log(`-------------------------------------------- User ${userDid} from ${config.feedName} feed --------------------------------------------`);

    await recordUsage(ctx, userDid, config.shortName, params.limit);

    let seed: number;
    let existingHomeRank;
    let existingDiscoverRank;
    let existingfollowsCursor;
    if (params.cursor) {
        const [passedSeed, rank1, rank2, timestamp] = params.cursor.split('::')
        existingHomeRank = rank1;
        existingDiscoverRank = rank2;
        existingfollowsCursor = timestamp;
        if (!passedSeed || !rank1) {
            throw new InvalidRequestError('malformed cursor')
        }
        seed = +passedSeed;
    } else {
        seed = new Date().getUTCMilliseconds();
    }

    console.log(`${seed}::${existingHomeRank}::${existingDiscoverRank}::${existingfollowsCursor}`);


    let generatedFeed;
    let res: any;
    let lastHomeRank;
    let lastDiscoverRank;
    let followsRate;
    try {
        const communityResponse: CommunityResponse = await getUserCommunities(ctx, userDid, config.communityConfig);
        const totalCommunities = communityResponse.topCommunitiesByLikes.communities.length + communityResponse.exploreCommunitiesByLikes.communities.length;
        const notEnoughCommunities = totalCommunities < config.communityConfig.totalCommunities;
        if (!existingHomeRank || !existingDiscoverRank) {
            console.log(`Generating first page...`);
            const firstPageCommunityResponse = sliceCommunityResponse(communityResponse, config.firstPageCommunities);
            console.log({ topCommunitiesByLikes: firstPageCommunityResponse.topCommunitiesByLikes.communities, exploreCommunities: firstPageCommunityResponse.exploreCommunitiesByLikes.communities });
            res = await getFirstPagePosts(ctx, {
                withWideExplore: notEnoughCommunities,
                repliesRatio: config.firstPageReplyRatio,
                seed,
                gravity: config.firstPageHNGravity,
                limit: params.limit * config.firstPagePostLookupMultiplier,
                minQuality: config.firstPageMinQuality
            }, firstPageCommunityResponse);
            lastHomeRank = 99999999;
            lastDiscoverRank = 99999999;
            followsRate = config.firstPageFollowsRate;
            res = shuffleRateLimitTrim(res, params.limit, seed, config.firstPageRandomizeWithinRateLimit);
        } else {
            //home part
            console.log(`Generating home posts...`);
            const homeCommunityResponse = sliceCommunityResponse(communityResponse, config.homeCommunities);
            console.log({ topCommunitiesByLikes: homeCommunityResponse.topCommunitiesByLikes.communities, exploreCommunities: homeCommunityResponse.exploreCommunitiesByLikes.communities });
            const homeRes: any = await getRankedPosts(ctx, {
                existingRank: existingHomeRank,
                withWideExplore: notEnoughCommunities,
                skipReplies: config.homeSkipReplies,
                gravity: config.homeHNGravity,
                limit: params.limit * config.homePostLookupMultiplier
            }, homeCommunityResponse);
            lastHomeRank = homeRes?.at(-1).rank;
            //discover part
            console.log(`Generating discover posts...`);
            const discoverCommunityResponse = sliceCommunityResponse(communityResponse, config.discoverCommunities);
            console.log({ topCommunitiesByLikes: discoverCommunityResponse.topCommunitiesByLikes.communities, exploreCommunities: discoverCommunityResponse.exploreCommunitiesByLikes.communities });
            const discoverRes: any = await getRankedPosts(ctx, {
                existingRank: existingDiscoverRank,
                withWideExplore: notEnoughCommunities,
                skipReplies: config.discoverSkipReplies,
                gravity: config.discoverHNGravity,
                limit: params.limit * config.homePostLookupMultiplier
            }, discoverCommunityResponse);
            lastDiscoverRank = discoverRes?.at(-1).rank;
            //mix in discover into home at a specified rate
            res = await mergePosts(
                seed,
                config.discoverPostsRate,
                rateLimit(homeRes, config.homeRandomizeWithinRateLimit, seed),
                rateLimit(discoverRes, config.discoverRandomizeWithinRateLimit, seed)
            );
            followsRate = config.homeFollowsRate;
            res = shuffleRateLimitTrim(res, params.limit, seed, false);
        }
        const { followsCursor, resultPosts } = await mergeWithFollows(ctx, followsRate, existingfollowsCursor, params.limit, seed, res, follows);

        const feed = resultPosts.filter(row => row !== undefined && row.uri !== undefined).map((row) => ({
            post: row.uri
        }))

        console.log(`-------------------------------------------- SUCCESS. Post output: ${feed.length} --------------------------------------------`)
        await recordPostOutput(ctx, userDid, config.shortName, params.limit, feed.length);

        generatedFeed = {
            cursor: `${seed}::${lastHomeRank}::${lastDiscoverRank}::${followsCursor}`,
            feed,
        }
    } catch (err) {
        console.error(err);
        console.log(`-------------------------------------------- ERROR. User: ${userDid} --------------------------------------------`)
        await recordPostOutput(ctx, userDid, config.shortName, params.limit, -1);

        generatedFeed = {
            cursor: `${seed}::${undefined}::${undefined}::${undefined}`,
            feed: []
        }
    }

    return generatedFeed;

}