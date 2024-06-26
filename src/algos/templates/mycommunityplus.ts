import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getFirstPagePosts, getRankedPosts, CommunityRequestConfig, CommunityResponse, getUserCommunities, sliceCommunityResponse } from '../common/communities'
import { mergePosts, rateLimit, shuffleRateLimitTrim } from '../common/util'
import { mixInFollows } from '../common/follows'
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

    //first page
    firstPageHNGravity: number;
    firstPageReplyRatio: number;
    firstPageHomeMinQuality: number;
    firstPageDiscoverMinQuality: number;
    firstPagePostLookupMultiplier: number;
    firstPageRandomizeWithinRateLimit: boolean;

    //follows mix in
    followsPostsRate: number;

    //home feed
    homeHNGravity: number;
    homeSkipReplies: boolean;
    homeCommunities: number;
    homePostLookupMultiplier: number;
    homeRandomizeWithinRateLimit: boolean;

    //discover mix in
    discoverHNGravity: number;
    discoverSkipReplies: boolean;
    discoverCommunities: number;
    discoverPostsRate: number;
    discoverRandomizeWithinRateLimit: boolean;

    //input communities
    mode: 'auto' | 'constellation' | 'nebula'
    trustedFriendsLimit: number,
    feedKey: string
}

export const generateCommunityPlusFeed = async (feedContext: FeedContext, config: MyCommunityPlusTemplateConfig) => {
    const { ctx, params, userDid, follows } = feedContext;

    const log: any[] = [];

    log.push(`-------------------------- User ${userDid} from ${config.feedName} feed. Limit: ${params.limit} --------------------------`)

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

    log.push(`${seed}::${existingHomeRank}::${existingDiscoverRank}::${existingfollowsCursor}`);


    let generatedFeed;
    let res: any;
    let lastHomeRank;
    let lastDiscoverRank;
    try {
        const communityResponse: CommunityResponse = await getUserCommunities(ctx.db, log, userDid, {
            mode: config.mode,
            trustedFriendsLimit: config.trustedFriendsLimit,
            homeCommunities: config.homeCommunities,
            discoverCommunities: config.discoverCommunities,
            feed: config.feedKey
        });
        //handle overrides
        const homeCommunities = communityResponse.feedOverrides?.home_communities ?? config.homeCommunities;
        const discoverCommunities = communityResponse.feedOverrides?.discover_communities ?? config.discoverCommunities;
        const totalCommunities = homeCommunities + discoverCommunities;
        const discoverRate = communityResponse.feedOverrides?.dicover_rate ?? config.discoverPostsRate;
        const followsRate = communityResponse.feedOverrides?.follows_rate ?? config.followsPostsRate;
        //handle overrides
        const totalResultingCommunities = communityResponse.topCommunitiesByLikes.communities.length + communityResponse.exploreCommunitiesByLikes.communities.length;
        const notEnoughCommunities = totalResultingCommunities < totalCommunities;
        console.log({ homeCommunities, discoverCommunities, totalCommunities, discoverRate, followsRate, notEnoughCommunities })
        if (!existingHomeRank || !existingDiscoverRank) {
            log.push(`Generating home first page...`);
            const firstPageCommunityResponse = sliceCommunityResponse(communityResponse, homeCommunities);
            log.push({
                topCommunitiesByLikes: firstPageCommunityResponse.topCommunitiesByLikes.communities,
                exploreCommunities: firstPageCommunityResponse.exploreCommunitiesByLikes.communities,
                addedCommunities: firstPageCommunityResponse.includeCommunities.communities,
                excludedCommunities: firstPageCommunityResponse.excludeCommunities.communities
            });
            const firstPageRes = await getFirstPagePosts(ctx, {
                withWideExplore: notEnoughCommunities,
                repliesRatio: config.firstPageReplyRatio,
                seed,
                gravity: config.firstPageHNGravity,
                limit: params.limit * config.firstPagePostLookupMultiplier,
                minQuality: config.firstPageHomeMinQuality
            }, firstPageCommunityResponse);
            lastHomeRank = 99999999;
            log.push(`Generating discover first page...`);
            const discoverCommunityResponse = sliceCommunityResponse(communityResponse, totalCommunities, homeCommunities);
            log.push({
                topCommunitiesByLikes: discoverCommunityResponse.topCommunitiesByLikes.communities,
                exploreCommunities: discoverCommunityResponse.exploreCommunitiesByLikes.communities,
                addedCommunities: discoverCommunityResponse.includeCommunities.communities,
                excludedCommunities: discoverCommunityResponse.excludeCommunities.communities
            });
            const discoverRes: any = await getFirstPagePosts(ctx, {
                withWideExplore: notEnoughCommunities,
                repliesRatio: config.discoverSkipReplies ? 0 : config.firstPageReplyRatio,
                seed,
                gravity: config.discoverHNGravity,
                limit: params.limit * config.firstPagePostLookupMultiplier,
                minQuality: config.firstPageDiscoverMinQuality
            }, discoverCommunityResponse);
            lastDiscoverRank = 99999999;
            //mix in discover into home at a specified rate
            res = await mergePosts(
                seed,
                discoverRate,
                rateLimit(firstPageRes, config.firstPageRandomizeWithinRateLimit, seed),
                rateLimit(discoverRes, config.discoverRandomizeWithinRateLimit, seed)
            );
            lastDiscoverRank = 99999999;
            res = shuffleRateLimitTrim(res, log, params.limit, seed, false);
        } else {
            //home part
            log.push(`Generating home posts...`);
            const homeCommunityResponse = sliceCommunityResponse(communityResponse, homeCommunities);
            log.push({
                topCommunitiesByLikes: homeCommunityResponse.topCommunitiesByLikes.communities,
                exploreCommunities: homeCommunityResponse.exploreCommunitiesByLikes.communities,
                addedCommunities: homeCommunityResponse.includeCommunities.communities,
                excludedCommunities: homeCommunityResponse.excludeCommunities.communities
            });
            const homeRes: any = await getRankedPosts(ctx, {
                existingRank: existingHomeRank,
                withWideExplore: notEnoughCommunities,
                skipReplies: config.homeSkipReplies,
                gravity: config.homeHNGravity,
                limit: params.limit * config.homePostLookupMultiplier
            }, homeCommunityResponse);
            lastHomeRank = homeRes?.at(-1).rank;
            //discover part
            log.push(`Generating discover posts...`);
            const discoverCommunityResponse = sliceCommunityResponse(communityResponse, totalCommunities, homeCommunities);
            log.push({
                topCommunitiesByLikes: discoverCommunityResponse.topCommunitiesByLikes.communities,
                exploreCommunities: discoverCommunityResponse.exploreCommunitiesByLikes.communities,
                addedCommunities: discoverCommunityResponse.includeCommunities.communities,
                excludedCommunities: discoverCommunityResponse.excludeCommunities.communities
            });
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
                discoverRate,
                rateLimit(homeRes, config.homeRandomizeWithinRateLimit, seed),
                rateLimit(discoverRes, config.discoverRandomizeWithinRateLimit, seed)
            );
            res = shuffleRateLimitTrim(res, log, params.limit, seed, false);
        }
        const { followsCursor, resultPosts } = await mixInFollows(ctx, log, followsRate, existingfollowsCursor, params.limit, seed, res, follows, communityResponse.feedOverrides);

        const feed = resultPosts.filter(row => row !== undefined && row.uri !== undefined).map((row) => ({
            post: row.uri
        }))

        log.push(`-------------------------- SUCCESS. Post output: ${feed.length} --------------------------`)
        await recordPostOutput(ctx, userDid, config.shortName, params.limit, feed.length);

        generatedFeed = {
            cursor: `${seed}::${lastHomeRank}::${lastDiscoverRank}::${followsCursor}`,
            feed,
        }
    } catch (err) {
        console.error(err);
        log.push(`-------------------------- ERROR. User: ${userDid} --------------------------`)
        await recordPostOutput(ctx, userDid, config.shortName, params.limit, -1);

        generatedFeed = {
            cursor: `${seed}::${undefined}::${undefined}::${undefined}`,
            feed: []
        }
    } finally {
        for (let i = 0; i < log.length; i++) {
            console.log(log[i])
        }
    }

    return generatedFeed;

}
