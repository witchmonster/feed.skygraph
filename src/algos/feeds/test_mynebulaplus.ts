import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { sql } from 'kysely'
import { getUserCommunity } from '../common/communities'
import { rateLimit, shuffleArray } from '../common/util'

// max 15 chars
export const shortname = 'dynamic'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string, follows?: string[]) => {
    console.log(`User ${userDid} from test_mynebulaplus feed`);

    let seed: number;
    let existingRank;
    if (params.cursor) {
        const [passedSeed, rank] = params.cursor.split('::')
        existingRank = rank;
        if (!passedSeed || !rank) {
            throw new InvalidRequestError('malformed cursor')
        }
        seed = +passedSeed;
    } else {
        seed = new Date().getUTCMilliseconds();
    }

    console.log(`${seed}::${existingRank}`);

    const { whereClause, userCommunity, topCommunitiesByLikes } = await getUserCommunity(ctx, userDid, { mode: "constellation", withTopLiked: true, withExplore: true });

    let res;
    if (!existingRank) {
        let randomized = ctx.db
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

        if (topCommunitiesByLikes && topCommunitiesByLikes.length > 0) {
            randomized = randomized
                .where((eb) => eb.or([
                    eb('post.e', 'in', topCommunitiesByLikes),
                    eb(whereClause, '=', userCommunity),
                ]))
        } else {
            randomized = randomized
                .where(whereClause, '=', userCommunity)
        }

        console.log(randomized.compile().sql);

        res = await randomized.execute();
    } else {
        let ranked = ctx.db
            .selectFrom([
                ctx.db.selectFrom('post')
                    .select(({ fn, val, ref }) => [
                        //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
                        'post.uri', 'post.author', 'o',
                        sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,3))`.as('rank')
                    ])
                    .innerJoin('postrank', 'post.uri', 'postrank.uri')
                    .select(['postrank.score'])
                    // .where('post.replyParent', 'is', null)
                    .orderBy('rank', 'desc')
                    .as('a')
            ])
            .selectAll()
            .limit(params.limit);

        if (topCommunitiesByLikes && topCommunitiesByLikes.length > 0) {
            ranked = ranked
                .where((eb) => eb.or([
                    eb('o', 'in', topCommunitiesByLikes),
                    eb('o', '=', userCommunity),
                ]))
        } else {
            ranked = ranked
                .where('o', '=', userCommunity)
        }

        if (existingRank) {
            ranked = ranked
                .where('rank', '<', existingRank)
        }

        console.log(ranked.compile().sql);

        res = await ranked.execute();
    }

    console.log(`${res.length}`);
    shuffleArray(res);

    const rateLimitedRes = rateLimit(res, 3);
    console.log(`rate limited to: ${rateLimitedRes.length}`);

    const feed = rateLimitedRes.map((row) => ({
        post: row.uri,
    }))

    let cursor: string | undefined
    const last = res.at(-1);
    if (last) {
        cursor = `${seed}::${existingRank ? last.rank : 10000}`
    }

    return {
        cursor,
        feed,
    }
}
