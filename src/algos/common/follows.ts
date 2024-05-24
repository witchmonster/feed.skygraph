import { sql } from 'kysely'
import { AppContext } from '../../config'
import { rateLimit } from './util';

const getFollowsPosts = async (ctx: AppContext, existingTimestamp: string, limit: number, follows: string[]) => {
    let chronological = ctx.db
        .selectFrom('post')
        .selectAll()
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