import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getFirstPagePosts, getRankedPosts, CommunityRequestConfig, getRankedPostsWithDrops } from '../common/communities'
import { mixInPosts, rateLimit, shuffleRateLimitTrim } from '../common/util'
import { mixInFollows } from '../common/follows'

// max 15 chars
export const shortname = 'dynamic'

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
        mode: "constellation",
        withTopLiked: true,
        withExplore: true,
        topLikedLimit: 16,
        trustedFriendsLimit: 5
    };
    let res;
    let lastRank;
    if (!existingRank) {
        res = await getFirstPagePosts(ctx, params.limit * 2, userDid, communityConfig);
        lastRank = 99999999;
    } else {
        res = await getRankedPostsWithDrops(ctx, existingRank, params.limit * 2, 3, userDid, communityConfig);
        lastRank = res.at(-1)?.rank;
        const res2: any = await getRankedPostsWithDrops(ctx, existingRank, params.limit * 2, 4, userDid, communityConfig);
        res = await mixInPosts(seed, 2, rateLimit(res), rateLimit(res2));
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
