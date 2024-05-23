import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { sql } from 'kysely'
import { getUserCommunity } from '../common/communities'
import { rateLimit, shuffleArray } from '../common/util'

// max 15 chars
export const shortname = 'dynamic'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string) => {
    console.log(`User ${userDid} from test_mynebulaplus feed`);

    let seed: number;
    let existingCid;
    if (params.cursor) {
        const [passedSeed, cid] = params.cursor.split('::')
        existingCid = cid;
        if (!passedSeed || !cid) {
            throw new InvalidRequestError('malformed cursor')
        }
        seed = +passedSeed;
    } else {
        seed = new Date().getUTCMilliseconds();
    }

    console.log(`${seed}::${existingCid}`);

    let builder = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking * rand(seed) - randomizes posts positions on every refresh while keeping them ~ranked
            //top posts are somewhat immune and, so adding extra protection from that:
            // if the post is popular (>50 likes) there's 70% chance it will get downranked to 10 likes so you don't see the same top liked post on top all the time
            sql<string>`((postrank.score-1)*(case when score > 50 and rand(${seed}) > 0.6 then 1 else 10/(score-1) end)*rand(${seed})/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .limit(params.limit);

    const { whereClause, userCommunity: community, topConstellationsByLikes } = await getUserCommunity(ctx, userDid, { mode: "constellation", withTopLiked: true, withExplore: true });

    if (topConstellationsByLikes && topConstellationsByLikes.length > 0) {
        builder = builder
            .where((eb) => eb.or([
                eb('post.o', 'in', topConstellationsByLikes),
                eb(whereClause, '=', community),
            ]))
    } else {
        builder = builder
            .where(whereClause, '=', community)
    }

    if (existingCid) {
        builder = builder
            .where('post.cid', '<', existingCid)
    }

    console.log(builder.compile().sql);

    const consistentRes = await builder.execute();

    console.log(`${consistentRes.length}`);
    shuffleArray(consistentRes);

    const rateLimitedRes = rateLimit(consistentRes, 3);
    console.log(`rate limited to: ${rateLimitedRes.length}`);

    const feed = rateLimitedRes.map((row) => ({
        post: row.uri,
    }))

    let cursor: string | undefined
    const last = consistentRes.at(-1);
    if (last) {
        cursor = `${seed}::${last.cid}`
    }

    return {
        cursor,
        feed,
    }
}
