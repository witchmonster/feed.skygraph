import { sql } from 'kysely'
import { AppContext } from '../../config'

enum Prefixes {
    Gigacluster = 'f',
    Supercluster = 's',
    Cluster = 'c',
    Galaxy = 'g',
    Nebula = 'e',
    Constellation = 'o',
}

interface CommunityResponse {
    userCommunity: { community: string, prefix: any }
    topCommunitiesByLikes: { communities: string[], prefix: any }
    exploreCommunitiesByLikes: { communities: string[], prefix: any }
}

interface CommunityRequestConfig {
    mode?: 'auto' | 'constellation' | 'nebula'
    withTopLiked?: boolean
    withExplore?: boolean
    topLikedLimit?: number
    trustedFriendsLimit?: number
}

const autoPickCommunity = async (ctx: AppContext, communitiesRes: any) => {
    console.log("auto-picking user community")
    const communityCodes: string[] = [
        (communitiesRes.rows[0] as any)?.f,
        (communitiesRes.rows[0] as any)?.s,
        (communitiesRes.rows[0] as any)?.c,
        (communitiesRes.rows[0] as any)?.g,
        (communitiesRes.rows[0] as any)?.e,
        (communitiesRes.rows[0] as any)?.o];


    const communities = await ctx.db.selectFrom('community')
        .selectAll()
        .where('community', 'in', communityCodes)
        .orderBy('community asc')
        .execute();

    console.log(communities);

    const perfectCommunity = (communities && communities.filter(community => community.size > 3000 && community.size < 50000)[0])
        ?? (communities && communities.filter(community => community.prefix === 's'))[0];

    console.log(perfectCommunity);

    return perfectCommunity;
}

const getUserCommunities = async (ctx: AppContext, userDid: string, config?: CommunityRequestConfig): Promise<CommunityResponse> => {
    // console.log("getting user community");
    const mode = config?.mode ?? "auto";
    userDid = userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647';
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid}`.execute(ctx.db);

    let userCommunity;
    let topLikedCommunityPrefix;
    let expandCommunityPrefix;

    const userHasCommunities = communitiesRes && communitiesRes.rows && communitiesRes.rows.length > 0;

    let topLikedLimit;
    let trustedFriendsLimit;
    if (mode === "constellation") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.o, prefix: 'o' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'o';
        expandCommunityPrefix = 'o';
        topLikedLimit = config?.topLikedLimit ?? 10;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    if (mode === "nebula") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.e, prefix: 'e' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'e';
        expandCommunityPrefix = 'e';
        topLikedLimit = config?.topLikedLimit ?? 10;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    //currently unused
    if (mode === "auto") {
        userCommunity = userHasCommunities ? await autoPickCommunity(ctx, communitiesRes) : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'o';
        expandCommunityPrefix = 'o';
        topLikedLimit = config?.topLikedLimit ?? 10;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    // console.log({ userCommunity, expandCommunityPrefix, topLikedLimit, trustedFriendsLimit })

    const userDidToCommunityDotPrefix: any = `did_to_community.${userCommunity.prefix}`;
    const topLikedCommunityDotPrefix: any = `did_to_community.${topLikedCommunityPrefix}`;
    const expandDidToCommunityDotPrefix: any = `did_to_community.${expandCommunityPrefix}`;

    if (config?.withTopLiked) {
        const topLikedCommunitiesQuery = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select([topLikedCommunityDotPrefix, 'likescore.subject'])
            //choose communities by poasters user liked most
            .where('likescore.author', '=', userDid)
            .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
            .groupBy(topLikedCommunityDotPrefix)
            .orderBy(sql`sum(likescore.score)`, 'desc')
            .limit(topLikedLimit);

        // console.log(topLikedCommunitiesQuery.compile().sql);

        const topLikedCommunities = await topLikedCommunitiesQuery.execute();

        const topCommunitiesByLikes: string[] = topLikedCommunities.filter(n => n[topLikedCommunityPrefix] !== undefined).map(n => n[topLikedCommunityPrefix]) as any;

        // console.log("top liked communities: " + topCommunitiesByLikes)

        if (config?.withExplore && topCommunitiesByLikes.length < topLikedLimit) {
            if (topCommunitiesByLikes.length > 0) {
                const exploreCommunitiesQuery = ctx.db.selectFrom('likescore')
                    .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
                    .select([expandDidToCommunityDotPrefix])
                    //choose "top trusted friends" from poasters user liked most
                    .where('likescore.author', 'in', topLikedCommunities.slice(0, trustedFriendsLimit).map(n => n.subject))
                    //exclude already seen communities
                    .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
                    .where(topLikedCommunityDotPrefix, 'not in', topCommunitiesByLikes)
                    //choose top liked communities by friends
                    .groupBy(expandDidToCommunityDotPrefix)
                    .orderBy(sql`sum(likescore.score)`, 'desc')
                    .limit(topLikedLimit - topCommunitiesByLikes.length);

                // console.log(exploreCommunitiesQuery.compile().sql);

                const exploreCommunities = await exploreCommunitiesQuery.execute();

                const exploreCommunitiesByLikes: string[] = exploreCommunities.filter(n => n[expandCommunityPrefix] !== undefined).map(n => n[expandCommunityPrefix]) as any;

                // console.log("explore communities: " + exploreCommunitiesByLikes)

                const response = {
                    userCommunity,
                    topCommunitiesByLikes: {
                        communities: topCommunitiesByLikes,
                        prefix: topLikedCommunityPrefix
                    },
                    exploreCommunitiesByLikes: {
                        communities: exploreCommunitiesByLikes,
                        prefix: expandCommunityPrefix
                    }
                }
                console.log(response)
                return response;
            } else {
                //autopick community
            }
        }

        const response = {
            userCommunity,
            topCommunitiesByLikes: {
                communities: topCommunitiesByLikes,
                prefix: topLikedCommunityPrefix
            },
            exploreCommunitiesByLikes: {
                communities: [],
                prefix: expandCommunityPrefix
            }
        }
        console.log(response)
        return response;
    }

    const response = {
        userCommunity,
        topCommunitiesByLikes: {
            communities: [],
            prefix: topLikedCommunityPrefix
        },
        exploreCommunitiesByLikes: {
            communities: [],
            prefix: expandCommunityPrefix
        }
    }
    console.log(response)
    return response;
}

const getFirstPagePosts = async (ctx: AppContext, limit: number, gravity: number, communityResponse: CommunityResponse) => {
    console.log(`-------------------- first page posts --------------------`);
    const { userCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes } = communityResponse;

    const lookupCommunities = (eb) => {
        const response = [
            eb(userCommunity.prefix, '=', userCommunity.community),
        ]

        if (topCommunitiesByLikes.communities.length > 0) {
            response.push(eb(topCommunitiesByLikes.prefix, 'in', topCommunitiesByLikes.communities))
        }

        if (exploreCommunitiesByLikes.communities.length > 0) {
            response.push(eb(exploreCommunitiesByLikes.prefix, 'in', exploreCommunitiesByLikes.communities))
        }

        return eb.or(response)
    };

    let rankomized = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            //top posts are somewhat immune and, so adding extra protection from that:
            //for a popular post there's 90% chance it will get downranked to 1 like so it doesn't stick around on top all the time
            //there's 50% chance for any other post to get downranked
            sql<string>`((score-1)*(case when score >= 50 and rand() >= 0.3 then 1 else 10/(score-1) end)*rand()/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .where(lookupCommunities)
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .limit(limit);

    // console.log(rankomized.compile().sql);

    return await rankomized.execute();
}

const getRankedPosts = async (ctx: AppContext, existingRank: any, limit: number, gravity: number, skipReplies: boolean, communityResponse: CommunityResponse) => {
    console.log(`-------------------- ranked posts --------------------`);
    if (existingRank === '0') {
        return undefined;
    }

    const { userCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes } = communityResponse;

    const prefixes = [...new Set([userCommunity.prefix, topCommunitiesByLikes.prefix, exploreCommunitiesByLikes.prefix])]

    const lookupCommunities = (eb) => {
        const response = [
            eb(userCommunity.prefix, '=', userCommunity.community),
        ]

        if (topCommunitiesByLikes.communities.length > 0) {
            response.push(eb(topCommunitiesByLikes.prefix, 'in', topCommunitiesByLikes.communities))
        }

        if (exploreCommunitiesByLikes.communities.length > 0) {
            response.push(eb(exploreCommunitiesByLikes.prefix, 'in', exploreCommunitiesByLikes.communities))
        }

        return eb.or(response)
    };

    let innerSelect = ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            'post.uri', 'post.author', 'post.indexedAt', ...prefixes,
            sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        .orderBy('rank', 'desc');

    if (skipReplies) {
        innerSelect = innerSelect
            .where('post.replyParent', 'is', null)
    }

    let ranked = ctx.db
        .selectFrom([
            innerSelect.as('a')
        ])
        .selectAll()
        .where(lookupCommunities)
        .limit(limit);

    if (existingRank) {
        ranked = ranked
            .where('rank', '<', existingRank)
    }

    // console.log(ranked.compile().sql);

    return await ranked.execute();
}

export { getUserCommunities, getFirstPagePosts, getRankedPosts, CommunityRequestConfig, CommunityResponse }