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
    let resultPosts: { author: string, uri: string }[] = [];
    if (follows && follows.length > 0) {
        const followsResponse = await getFollowsPosts(ctx, existingCursor, limit * 2, follows);
        const rateLimitedFollows = rateLimit(followsResponse, false);
        let j = 0;
        let i = 0;
        while (i < posts.length && j < follows.length && resultPosts.length < limit) {
            if (posts[i].author === posts[j].author) {
                resultPosts.push(posts[j]);
                console.log(`${resultPosts.length}=>original ${posts[i].uri}`)
                i++;
            } else {
                if (resultPosts.length % 3 === seed % 3) {
                    resultPosts.push(rateLimitedFollows[j]);
                    console.log(`${resultPosts.length}=>follows at [${j}]:${rateLimitedFollows[j].uri}`)
                    j++;
                } else {
                    resultPosts.push(posts[j]);
                    console.log(`${resultPosts.length}=>original ${posts[i].uri}`)
                    i++;
                }
            }
        }
    } else {
        resultPosts = posts.slice(0, limit);
    }
    return { followsCursor, resultPosts };
}

export { mixInFollows }