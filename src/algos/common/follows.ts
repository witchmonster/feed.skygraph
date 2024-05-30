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

const mixInFollows = async (ctx: AppContext, log: any[], followsRate: number, existingCursor: string, limit: number, seed: number, posts: any[], follows: string[] | undefined) => {
    let followsCursor;
    let resultPosts: { author: string, uri: string }[] = [];
    if (follows && follows.length > 0) {
        const followsResponse = await getFollowsPosts(ctx, existingCursor, limit * 2, follows);
        const rateLimitedFollows = rateLimit(followsResponse, true, seed);
        let j = 0;
        let i = 0;
        log.push(`Merging in follows... ${rateLimitedFollows?.length}`);
        while (i < posts.length && j < rateLimitedFollows.length && resultPosts.length < limit) {
            if (resultPosts.length % followsRate === seed % followsRate) {
                //don't add duplicate posts
                if (posts.indexOf(rateLimitedFollows[j]) === -1) {
                    // console.log(`${resultPosts.length}=>follows at [${j}]:${rateLimitedFollows[j]?.uri}`)
                    resultPosts.push(rateLimitedFollows[j]);
                }
                j++;
            } else {
                // console.log(`${resultPosts.length}=>original ${posts[i].uri}`)
                resultPosts.push(posts[i]);
                i++;
            }
        }
        while (i < posts.length && resultPosts.length < limit) {
            // console.log(`${resultPosts.length}=>original ${posts[i].uri}`)
            resultPosts.push(posts[i]);
            i++;
        }
        while (j < rateLimitedFollows.length) {
            // console.log(`${resultPosts.length}=>follows at [${j}]:${rateLimitedFollows[j]?.uri}`)
            resultPosts.push(rateLimitedFollows[j]);
            j++;
        }
        if (followsResponse.length === 0) {
            resultPosts = posts;
        }
    } else {
        resultPosts = posts.slice(0, limit);
    }
    return { followsCursor, resultPosts: resultPosts.slice(0, limit) };
}

export { mixInFollows }