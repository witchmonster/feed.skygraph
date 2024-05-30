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
    exploreCommunity: { community: string, prefix: any }
    topCommunitiesByLikes: { communities: string[], prefix: any }
    exploreCommunitiesByLikes: { communities: string[], prefix: any }
}

interface CommunityRequestConfig {
    mode?: 'auto' | 'constellation' | 'nebula'
    totalCommunities: number
    trustedFriendsLimit: number
}

interface FirstPageRequestConfig {
    withWideExplore: boolean,
    repliesRatio: number,
    seed: number,
    gravity: number,
    limit: number,
    minQuality?: number,
    noReplies?: boolean
}

interface RankedRequestConfig {
    withWideExplore: boolean,
    skipReplies: boolean,
    existingRank: any,
    gravity: number,
    limit: number,
}

const autoPickCommunity = async (ctx: AppContext, log: any[], communitiesRes: any) => {
    // console.log("auto-picking user community")
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

    log.push(communities);

    const largestCommunity = communities.reduce((p, c) => c.size > p.size ? c : p, communities[0]);
    const min50kCommunities = communities.filter(community => community.size >= 50000);
    const min20kCommunities = communities.filter(community => community.size >= 20000 && community.size < 50000);
    const min10kCommunities = communities.filter(community => community.size >= 10000 && community.size < 20000);
    const min5kCommunities = communities.filter(community => community.size >= 5000 && community.size < 10000);
    const max5kCommunities = communities.filter(community => community.size >= 1000 && community.size < 5000);
    //largest of 5k+
    const over5kSweetSpotCommunity = min5kCommunities[0] && min5kCommunities.reduce((p, c) => c.size > p.size ? c : p, min5kCommunities[0]);
    //smallest of 10k+
    const over10kSweetSpotCommunity = min10kCommunities[0] && min10kCommunities.reduce((p, c) => c.size < p.size ? c : p, min10kCommunities[0]);
    //smallest of 20k+
    const over20kSweetSpotCommunity = min20kCommunities[0] && min20kCommunities.reduce((p, c) => c.size < p.size ? c : p, min20kCommunities[0]);
    //largest of under 5k
    const under5kSweetSpotCommunity = max5kCommunities[0] && max5kCommunities.reduce((p, c) => c.size > p.size ? c : p, max5kCommunities[0]);
    //smallest of 50k+ (those are too large, but better than picking 250+ gigacluster)
    const lesserEvilCommunity = min50kCommunities[0] && min50kCommunities.reduce((p, c) => c.size < p.size ? c : p, min50kCommunities[0]);

    const perfectCommunity = over5kSweetSpotCommunity ?? over10kSweetSpotCommunity ?? over20kSweetSpotCommunity ?? under5kSweetSpotCommunity ?? lesserEvilCommunity ?? largestCommunity;

    log.push({
        'Auto-picked community': `${perfectCommunity.community}: ${perfectCommunity.size}`,
        'First Choice (>5k <10k)': `${over5kSweetSpotCommunity?.community}: ${over5kSweetSpotCommunity?.size}`,
        'Backup #1 (>10k <20k)': `${over10kSweetSpotCommunity?.community}: ${over10kSweetSpotCommunity?.size}`,
        'Backup #2 (>20k <50k)': `${over20kSweetSpotCommunity?.community}: ${over20kSweetSpotCommunity?.size}`,
        'Backup #3 (>1k <5k)': `${under5kSweetSpotCommunity?.community}: ${under5kSweetSpotCommunity?.size}`,
        'Backup #4 (>50k)': `${lesserEvilCommunity?.community}: ${lesserEvilCommunity?.size}`,
        //in most cases you don't want to hit that
        'Backup #5 (largest)': `${largestCommunity.community}:${largestCommunity.size}`
    });

    return perfectCommunity;
}

const getUserCommunities = async (ctx: AppContext, log: any[], userDid: string, config?: CommunityRequestConfig): Promise<CommunityResponse> => {
    // console.log("getting user community");
    const mode = config?.mode ?? "auto";
    userDid = userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647';
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid}`.execute(ctx.db);

    let userCommunity;
    let topLikedCommunityPrefix;
    let expandCommunityPrefix;

    const userHasCommunities = communitiesRes && communitiesRes.rows && communitiesRes.rows.length > 0;
    const exploreCommunity = userHasCommunities ? await autoPickCommunity(ctx, log, communitiesRes) : { community: 's574', prefix: 's' };

    let minCommunities;
    let trustedFriendsLimit;
    if (mode === "constellation") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.o, prefix: 'o' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'o';
        expandCommunityPrefix = 'o';
        minCommunities = config?.totalCommunities ?? 12;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    if (mode === "nebula") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.e, prefix: 'e' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'e';
        expandCommunityPrefix = 'e';
        minCommunities = config?.totalCommunities ?? 5;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    // console.log({ userCommunity, expandCommunityPrefix, topLikedLimit, trustedFriendsLimit })

    const userDidToCommunityDotPrefix: any = `did_to_community.${userCommunity.prefix}`;
    const topLikedCommunityDotPrefix: any = `did_to_community.${topLikedCommunityPrefix}`;
    const expandDidToCommunityDotPrefix: any = `did_to_community.${expandCommunityPrefix}`;

    if (config?.totalCommunities && config?.totalCommunities > 0) {
        const topLikedCommunitiesQuery = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select([topLikedCommunityDotPrefix, 'likescore.subject'])
            //choose communities by poasters user liked most
            .where('likescore.author', '=', userDid)
            .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
            .groupBy(topLikedCommunityDotPrefix)
            .orderBy(sql`sum(likescore.score)`, 'desc')
            .limit(minCommunities);

        // console.log(topLikedCommunitiesQuery.compile().sql);

        const topLikedCommunities = await topLikedCommunitiesQuery.execute();

        const topCommunitiesByLikes: string[] = topLikedCommunities.filter(n => n[topLikedCommunityPrefix] !== undefined).map(n => n[topLikedCommunityPrefix]) as any;

        // console.log("top liked communities: " + topCommunitiesByLikes)

        if (topCommunitiesByLikes.length < minCommunities) {
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
                    .limit(minCommunities - topCommunitiesByLikes.length);

                // console.log(exploreCommunitiesQuery.compile().sql);

                const exploreCommunities = await exploreCommunitiesQuery.execute();

                const exploreCommunitiesByLikes: string[] = exploreCommunities.filter(n => n[expandCommunityPrefix] !== undefined).map(n => n[expandCommunityPrefix]) as any;

                // console.log("explore communities: " + exploreCommunitiesByLikes)

                const response = {
                    userCommunity,
                    exploreCommunity,
                    topCommunitiesByLikes: {
                        communities: topCommunitiesByLikes,
                        prefix: topLikedCommunityPrefix
                    },
                    exploreCommunitiesByLikes: {
                        communities: exploreCommunitiesByLikes,
                        prefix: expandCommunityPrefix
                    }
                }
                // console.log(response)
                return response;
            }
        }

        const response = {
            userCommunity,
            exploreCommunity,
            topCommunitiesByLikes: {
                communities: topCommunitiesByLikes,
                prefix: topLikedCommunityPrefix
            },
            exploreCommunitiesByLikes: {
                communities: [],
                prefix: expandCommunityPrefix
            }
        }
        // console.log(response)
        return response;
    }

    const response = {
        userCommunity,
        exploreCommunity,
        topCommunitiesByLikes: {
            communities: [],
            prefix: topLikedCommunityPrefix
        },
        exploreCommunitiesByLikes: {
            communities: [],
            prefix: expandCommunityPrefix
        }
    }
    // console.log(response)
    return response;
}

const getFirstPagePosts = async (ctx: AppContext, config: FirstPageRequestConfig, communityResponse: CommunityResponse) => {
    // console.log(`-------------------- first page posts --------------------`);
    const { withWideExplore, repliesRatio, seed, gravity, limit, minQuality, noReplies } = config;
    const { userCommunity, exploreCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes } = communityResponse;

    const lookupCommunities = (eb) => {
        const response = [
            eb(userCommunity.prefix, '=', userCommunity.community)
        ]

        if (withWideExplore || (topCommunitiesByLikes.communities.length === 0 && exploreCommunitiesByLikes.communities.length === 0)) {
            response.push(eb(exploreCommunity.prefix, '=', exploreCommunity.community))
        }

        if (topCommunitiesByLikes.communities.length > 0) {
            response.push(eb(topCommunitiesByLikes.prefix, 'in', topCommunitiesByLikes.communities))
        }

        if (exploreCommunitiesByLikes.communities.length > 0) {
            response.push(eb(exploreCommunitiesByLikes.prefix, 'in', exploreCommunitiesByLikes.communities))
        }

        return eb.or(response)
    };

    // const withinLastDay: string = sql`DATE_SUB(now(), INTERVAL 1 DAY)`;
    let firstPageQuery = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            //top posts are somewhat immune and, so adding downranking for that
            //chance for any reply to get dropped
            sql<string>`((score-1)*(case when 'post.replyParent' is not null and rand(${seed}) <= ${repliesRatio} then 1 else 0 end)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .where(lookupCommunities)
        .where('post.indexedAt', '>', (sql`DATE_SUB(now(), INTERVAL 1 DAY)` as any))
        .orderBy('rank', 'desc')
        .limit(limit);

    if (minQuality) {
        firstPageQuery = firstPageQuery
            .where('postrank.score', '>=', minQuality)

    }
    if (noReplies) {
        firstPageQuery = firstPageQuery
            .where('post.replyParent', 'is', null)
    }

    // console.log(firstPageQuery.compile().sql);

    return await firstPageQuery.execute();
}

const getRankedPosts = async (ctx: AppContext, config: RankedRequestConfig, communityResponse: CommunityResponse) => {
    // console.log(`-------------------- ranked posts --------------------`);
    const { withWideExplore: withExplore, skipReplies, existingRank, gravity, limit } = config;
    const { userCommunity, exploreCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes } = communityResponse;

    const prefixes = [...new Set([userCommunity.prefix, exploreCommunity.prefix, topCommunitiesByLikes.prefix, exploreCommunitiesByLikes.prefix])]

    const lookupCommunities = (eb) => {
        const response = [
            eb(userCommunity.prefix, '=', userCommunity.community),
        ]

        if (withExplore || (topCommunitiesByLikes.communities.length === 0 && exploreCommunitiesByLikes.communities.length === 0)) {
            response.push(eb(exploreCommunity.prefix, '=', exploreCommunity.community))
        }

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
            .where('rank', '<=', existingRank)
    }

    // console.log(ranked.compile().sql);

    return await ranked.execute();
}

const sliceCommunityResponse = (res: CommunityResponse, maxCount: number) => {
    const topLikedSlice = res.topCommunitiesByLikes.communities.slice(0, maxCount);
    const explorePortion = maxCount - topLikedSlice.length;
    return {
        ...res, topCommunitiesByLikes: {
            communities: topLikedSlice,
            prefix: res.topCommunitiesByLikes.prefix
        }, exploreCommunitiesByLikes: {
            communities: explorePortion === 0 ? [] : res.exploreCommunitiesByLikes.communities.slice(0, explorePortion),
            prefix: res.exploreCommunitiesByLikes.prefix
        }
    };
}

export { getUserCommunities, getFirstPagePosts, getRankedPosts, sliceCommunityResponse, FirstPageRequestConfig, CommunityRequestConfig, CommunityResponse }