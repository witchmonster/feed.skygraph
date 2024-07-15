import { sql } from 'kysely'
import { AppContext } from '../../config'
import { Database } from '../../db'
import { FeedOverrides } from '../../db/schema'

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
    includeCommunities: { communities: string[], prefix: any }
    excludeCommunities: { communities: string[], prefix: any }
    feedOverrides?: FeedOverrides
}

interface CommunityRequestConfig {
    mode: 'auto' | 'constellation' | 'nebula'
    homeCommunities: number
    discoverCommunities: number
    trustedFriendsLimit: number
    feed: string
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

const autoPickCommunity = async (db: Database, log: any[], communitiesRes: any) => {
    // console.log("auto-picking user community")
    const communityCodes: string[] = [
        (communitiesRes.rows[0] as any)?.f,
        (communitiesRes.rows[0] as any)?.s,
        (communitiesRes.rows[0] as any)?.c,
        (communitiesRes.rows[0] as any)?.g,
        (communitiesRes.rows[0] as any)?.e,
        (communitiesRes.rows[0] as any)?.o];


    const communities = await db.selectFrom('community')
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

const getUserCommunities = async (db: Database, log: any[], userDid: string, config?: CommunityRequestConfig): Promise<CommunityResponse> => {
    let statusQuery = db.selectFrom('feed_overrides')
        .selectAll()
        .where('user', '=', userDid);

    if (config?.feed) {
        statusQuery = statusQuery
            .where('feed', '=', config.feed)
    }
    const feedOverrideOptions = await statusQuery.executeTakeFirst();

    //handle overrides
    const homeCommunities = feedOverrideOptions?.home_communities ?? config?.homeCommunities;
    const discoverCommunities = feedOverrideOptions?.discover_communities ?? config?.discoverCommunities;
    const totalCommunities = homeCommunities && discoverCommunities ? homeCommunities + discoverCommunities : undefined;
    //handle overrides

    const notOptedOut = !feedOverrideOptions || !feedOverrideOptions.optout;

    // console.log(`optout: ${!notOptedOut}`);
    log.push({ current: feedOverrideOptions })
    const mode = config?.mode ?? "auto";
    userDid = userDid && notOptedOut ? userDid : 'did:plc:v7iswx544swf2usdcp32p647';
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid}`.execute(db);

    let userCommunity;
    let topLikedCommunityPrefix;
    let expandCommunityPrefix;

    const userHasCommunities = communitiesRes && communitiesRes.rows && communitiesRes.rows.length > 0;
    const exploreCommunity = userHasCommunities ? await autoPickCommunity(db, log, communitiesRes) : { community: 's574', prefix: 's' };

    let minCommunities;
    let trustedFriendsLimit;
    if (mode === "constellation") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.o, prefix: 'o' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'o';
        expandCommunityPrefix = 'o';
        minCommunities = totalCommunities ?? 12;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    if (mode === "nebula") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.e, prefix: 'e' } : { community: 's574', prefix: 's' };
        topLikedCommunityPrefix = 'e';
        expandCommunityPrefix = 'e';
        minCommunities = totalCommunities ?? 5;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    //handle overrides
    const includeCommunities = feedOverrideOptions?.c_include && feedOverrideOptions?.c_include.length > 0
        ? { communities: feedOverrideOptions?.c_include, prefix: feedOverrideOptions?.c_include[0].substring(0, 1) }
        : { communities: [], prefix: topLikedCommunityPrefix };
    const excludeCommunities = feedOverrideOptions?.c_exclude && feedOverrideOptions?.c_exclude.length > 0
        ? { communities: feedOverrideOptions?.c_exclude, prefix: feedOverrideOptions?.c_exclude[0].substring(0, 1) }
        : { communities: [], prefix: topLikedCommunityPrefix };
    //handle overrides

    // console.log({ userCommunity, expandCommunityPrefix, topLikedLimit, trustedFriendsLimit })

    const userDidToCommunityDotPrefix: any = `did_to_community.${userCommunity.prefix}`;
    const topLikedCommunityDotPrefix: any = `did_to_community.${topLikedCommunityPrefix}`;
    const expandDidToCommunityDotPrefix: any = `did_to_community.${expandCommunityPrefix}`;

    if (totalCommunities && totalCommunities > 0) {
        let topLikedCommunitiesQuery = db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select([topLikedCommunityDotPrefix, 'likescore.subject'])
            //choose communities by poasters user liked most
            .where('likescore.author', '=', userDid)
            .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
            .groupBy(topLikedCommunityDotPrefix)
            .orderBy(sql`sum(likescore.score)`, 'desc')
            .limit(minCommunities);

        if (excludeCommunities && excludeCommunities.communities.length > 0) {
            topLikedCommunitiesQuery = topLikedCommunitiesQuery
                .where(topLikedCommunityDotPrefix, 'not in', excludeCommunities.communities)
        }

        // console.log(topLikedCommunitiesQuery.compile().sql);

        const topLikedCommunities = await topLikedCommunitiesQuery.execute();

        const topCommunitiesByLikes: string[] = topLikedCommunities.filter(n => n[topLikedCommunityPrefix] !== undefined).map(n => n[topLikedCommunityPrefix]) as any;

        // console.log("top liked communities: " + topCommunitiesByLikes)

        if (topCommunitiesByLikes.length < minCommunities) {
            if (topCommunitiesByLikes.length > 0) {
                let exploreCommunitiesQuery = db.selectFrom('likescore')
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

                if (excludeCommunities && excludeCommunities.communities.length > 0) {
                    exploreCommunitiesQuery = exploreCommunitiesQuery
                        .where(topLikedCommunityDotPrefix, 'not in', excludeCommunities.communities)
                }

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
                    },
                    feedOverrides: feedOverrideOptions,
                    includeCommunities,
                    excludeCommunities
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
            },
            feedOverrides: feedOverrideOptions,
            includeCommunities,
            excludeCommunities
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
        },
        feedOverrides: feedOverrideOptions,
        includeCommunities,
        excludeCommunities
    }
    // console.log(response)
    return response;
}

const getFirstPagePosts = async (ctx: AppContext, config: FirstPageRequestConfig, communityResponse: CommunityResponse) => {
    // console.log(`-------------------- first page posts --------------------`);
    const { withWideExplore, repliesRatio, seed, gravity, limit, minQuality, noReplies } = config;
    const { userCommunity, exploreCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes, includeCommunities, excludeCommunities } = communityResponse;

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

        if (includeCommunities.communities.length > 0) {
            response.push(eb(includeCommunities.prefix, 'in', includeCommunities.communities))
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
        .leftJoin('feed_overrides', 'post.author', 'feed_overrides.user')
        .where(lookupCommunities)
        .where('post.indexedAt', '>', (sql`DATE_SUB(now(), INTERVAL 1 DAY)` as any))
        .where((eb) => eb.or([
            eb('feed_overrides.optout', 'is', null),
            eb('feed_overrides.optout', '<>', true)
        ]))
        .orderBy('rank', 'desc')
        .limit(limit);

    if (excludeCommunities.communities.length > 0) {
        firstPageQuery = firstPageQuery
            .where(excludeCommunities.prefix, 'not in', excludeCommunities.communities)
    }

    if (minQuality) {
        firstPageQuery = firstPageQuery
            .where('postrank.score', '>=', minQuality)

    }
    if (noReplies || communityResponse.feedOverrides?.hide_replies || repliesRatio === 0) {
        firstPageQuery = firstPageQuery
            .where('post.replyParent', 'is', null)
    }

    // console.log(firstPageQuery.compile().sql);

    return await firstPageQuery.execute();
}

const getRankedPosts = async (ctx: AppContext, config: RankedRequestConfig, communityResponse: CommunityResponse) => {
    // console.log(`-------------------- ranked posts --------------------`);
    const { withWideExplore: withExplore, skipReplies, existingRank, gravity, limit } = config;
    const { userCommunity, exploreCommunity, topCommunitiesByLikes, exploreCommunitiesByLikes, includeCommunities, excludeCommunities } = communityResponse;

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

        if (includeCommunities.communities.length > 0) {
            response.push(eb(includeCommunities.prefix, 'in', includeCommunities.communities))
        }

        return eb.or(response)
    };

    let innerSelect = ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            'post.uri', 'post.author', 'post.indexedAt', ...prefixes,
            sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
        ])
        .leftJoin('feed_overrides', 'post.author', 'feed_overrides.user')
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        .where((eb) => eb.or([
            eb('feed_overrides.optout', 'is', null),
            eb('feed_overrides.optout', '<>', true)
        ]))
        .orderBy('rank', 'desc');

    if (excludeCommunities.communities.length > 0) {
        innerSelect = innerSelect
            .where(excludeCommunities.prefix, 'not in', excludeCommunities.communities)
    }

    if (skipReplies || communityResponse.feedOverrides?.hide_replies) {
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

const sliceCommunityResponse = (res: CommunityResponse, totalCount: number, skipFirst?: number) => {
    const startPos = skipFirst ? skipFirst : 0;
    const topLikedSlice = res.topCommunitiesByLikes.communities.slice(startPos, totalCount);
    const explorePortion = totalCount - topLikedSlice.length;
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