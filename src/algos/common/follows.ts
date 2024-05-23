import { sql } from 'kysely'
import { AppContext } from '../../config'
import { rateLimit } from './util';

const getFollowsPosts = async (ctx: AppContext, existingTimestamp: string, limit: number, follows: string[]) => {
    let chronological = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking * rand(seed) - randomizes posts positions on every refresh while keeping them ~ranked
            //top posts are somewhat immune and, so adding extra protection from that:
            // if the post is popular (>50 likes) there's 90% chance it will get downranked to 10 likes so you don't see the same top liked post on top all the time
            sql<string>`((postrank.score-1)*(case when score > 50 and rand() > 0.8 then 1 else 10/(score-1) end)*rand()/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .where('post.author', 'in', follows)
        // .where('post.replyParent', 'is', null)
        .orderBy('indexedAt', 'desc')
        .limit(limit);

    if (existingTimestamp) {
        chronological = chronological
            .where('indexedAt', '<=', existingTimestamp)
    }

    // console.log(chronological.compile().sql);

    return await chronological.execute();
}

const mixInFollows = async (ctx: AppContext, existingCursor: string, limit: number, seed: number, posts: any[], follows: string[] | undefined) => {
    let followsCursor;
    if (follows && follows.length > 0) {
        const followsResponse = await getFollowsPosts(ctx, existingCursor, limit * 2, follows);
        const rateLimitedFollows = rateLimit(followsResponse, false);
        if (rateLimitedFollows && rateLimitedFollows.length > 0) {
            //shuffle in some follows (25%). followsPosts are chronological
            let j = 0;
            for (let i = 0; i < posts.length && j < rateLimitedFollows.length; i++) {
                const pos = seed % 5;
                //never zero - it's annoying and sticky
                if (pos !== 0 && i % 5 === pos) {
                    posts[i] = rateLimitedFollows[j];
                    followsCursor = rateLimitedFollows[j].indexedAt;
                    console.log(`${i}=>follows at [${j}]:${rateLimitedFollows[j].uri}`)
                    j++;
                } else {
                    console.log(`${i}=>original ${posts[i].uri}`)
                }
            }
        }
    }
    return followsCursor;
}

export { mixInFollows }