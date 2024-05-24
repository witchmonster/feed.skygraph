import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { getRankomizedPosts, getRankedPosts, CommunityRequestConfig } from '../common/communities'
import { rateLimit, shuffleRateLimitTrim } from '../common/util'
import { mixInFollows } from '../common/follows'

// max 15 chars
export const shortname = 'nebula_plus'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
    console.log(`User ${userDid} from "My Nebula+" feed`);

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

    const communityConfig: CommunityRequestConfig = { mode: "constellation", withTopLiked: true, withExplore: true };

    let res;
    let lastRank;
    if (!existingRank) {
        res = await getRankomizedPosts(ctx, params.limit * 2, userDid, communityConfig);
        lastRank = 99999999;
    } else {
        const rankingGravity = 3;
        res = await getRankedPosts(ctx, existingRank, params.limit * 2, rankingGravity, userDid, communityConfig);
        lastRank = res.at(-1)?.rank;
    }

    const posts = shuffleRateLimitTrim(res, params.limit);

    const followsCursor = await mixInFollows(ctx, existingfollowsCursor, params.limit, seed, posts, follows);

    const feed = posts.map((row) => ({
        post: row.uri,
    }))

    return {
        cursor: `${seed}::${lastRank}::${followsCursor}`,
        feed,
    }
}
