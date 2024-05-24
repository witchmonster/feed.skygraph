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
    whereClause: any,
    userCommunity: { community: string, prefix: any },
    expandCommunities?: string[]
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

const getUserCommunity = async (ctx: AppContext, userDid: string, config?: CommunityRequestConfig): Promise<CommunityResponse> => {
    console.log("getting user community");
    const mode = config?.mode ?? "auto";
    userDid = userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647';
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid}`.execute(ctx.db);

    let userCommunity;
    let expandCommunityPrefix;

    const userHasCommunities = communitiesRes && communitiesRes.rows && communitiesRes.rows.length > 0;

    let topLikedLimit;
    let trustedFriendsLimit;
    if (mode === "constellation") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.o, prefix: 'o' } : { community: 's574', prefix: 's' };
        expandCommunityPrefix = "o"
        topLikedLimit = config?.topLikedLimit ?? 16;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    if (mode === "nebula") {
        userCommunity = userHasCommunities ? { community: (communitiesRes?.rows[0] as any)?.e, prefix: 'e' } : { community: 's574', prefix: 's' };
        expandCommunityPrefix = 'e';
        topLikedLimit = config?.topLikedLimit ?? 8;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    //currently unused
    if (mode === "auto") {
        userCommunity = userHasCommunities ? await autoPickCommunity(ctx, communitiesRes) : { community: 's574', prefix: 's' };
        expandCommunityPrefix = 'o';
        topLikedLimit = config?.topLikedLimit ?? 16;
        trustedFriendsLimit = config?.trustedFriendsLimit ?? 5;
    }

    console.log({ userCommunity, expandCommunityPrefix, topLikedLimit, trustedFriendsLimit })

    const userPostDotCommunityPrefix: any = `post.${userCommunity.prefix}`;
    const userDidToCommunityDotPrefix: any = `did_to_community.${userCommunity.prefix}`;
    const expandPostDotCommunityPrefix: any = `post.${expandCommunityPrefix}`;
    const expandDidToCommunityDotPrefix: any = `did_to_community.${expandCommunityPrefix}`;

    if (config?.withTopLiked) {
        const topLikedCommunitiesQuery = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select([expandDidToCommunityDotPrefix, 'likescore.subject'])
            //choose communities by poasters user liked most
            .where('likescore.author', '=', userDid)
            .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
            .groupBy(expandDidToCommunityDotPrefix)
            .orderBy(sql`sum(likescore.score)`, 'desc')
            .limit(topLikedLimit);

        console.log(topLikedCommunitiesQuery.compile().sql);

        const topLikedCommunities = await topLikedCommunitiesQuery.execute();

        const topCommunitiesByLikes: string[] = topLikedCommunities.filter(n => n[expandCommunityPrefix] !== undefined).map(n => n[expandCommunityPrefix]) as any;

        // console.log("top liked communities: " + topCommunitiesByLikes)

        if (config?.withExplore && topCommunitiesByLikes.length < topLikedLimit) {
            if (topLikedCommunities && topLikedCommunities.length > 0) {
                const exploreCommunitiesQuery = ctx.db.selectFrom('likescore')
                    .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
                    .select([expandDidToCommunityDotPrefix])
                    //choose "top trusted friends" from poasters user liked most
                    .where('likescore.author', 'in', topLikedCommunities.slice(0, trustedFriendsLimit).map(n => n.subject))
                    //exclude already seen communities
                    .where(userDidToCommunityDotPrefix, '<>', userCommunity.community)
                    .where(expandDidToCommunityDotPrefix, 'not in', topCommunitiesByLikes)
                    .groupBy(expandDidToCommunityDotPrefix)
                    .orderBy(sql`sum(likescore.score)`, 'desc')
                    .limit(topLikedLimit - topCommunitiesByLikes.length);

                console.log(exploreCommunitiesQuery.compile().sql);

                const exploreCommunities = await exploreCommunitiesQuery.execute();

                const exploreCommunitiesByLikes: string[] = exploreCommunities.filter(n => n[expandCommunityPrefix] !== undefined).map(n => n[expandCommunityPrefix]) as any;

                // console.log("explore communities: " + exploreCommunitiesByLikes)

                console.log({ userPostDotCommunityPrefix, userCommunity, expandCommunityPrefix, topCommunitiesByLikes, exploreCommunitiesByLikes })
                return { whereClause: expandPostDotCommunityPrefix, userCommunity, expandCommunities: [...topCommunitiesByLikes, ...exploreCommunitiesByLikes] };
            }
        }

        console.log({ userPostDotCommunityPrefix, userCommunity, expandCommunityPrefix, topCommunitiesByLikes, exploreCommunitiesByLikes: [] })
        return { whereClause: userPostDotCommunityPrefix, userCommunity, expandCommunities: topCommunitiesByLikes };
    }

    console.log({ userPostDotCommunityPrefix, userCommunity, expandCommunityPrefix, topCommunitiesByLikes: [], exploreCommunitiesByLikes: [] })
    return { whereClause: userPostDotCommunityPrefix, userCommunity };
}

const getFirstPagePosts = async (ctx: AppContext, limit: number, userDid: string, config: CommunityRequestConfig) => {
    console.log(`getting first page posts`);
    const { userCommunity, expandPrefix, expandCommunities } = await getUserCommunities(ctx, userDid, config);

    let rankomized = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            //top posts are somewhat immune and, so adding extra protection from that:
            //for a popular post there's 90% chance it will get downranked to 1 like so it doesn't stick around on top all the time
            //there's 50% chance for any other post to get downranked
            sql<string>`((score-1)*(case when score >= 50 and rand() >= 0.8 then 1 else 0 end)*(case when score < 50 and rand() >= 0.5 then 1 else 0 end)*rand()/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .limit(limit);

    if (expandPrefix && expandCommunities && expandCommunities.length > 0) {
        rankomized = rankomized
            .where((eb) => eb.or([
                eb(expandPrefix, 'in', expandCommunities),
                eb(userCommunity.prefix, '=', userCommunity.community),
            ]))
    } else {
        rankomized = rankomized
            .where(userCommunity.prefix, '=', userCommunity.community)
    }

    // console.log(rankomized.compile().sql);

    return await rankomized.execute();
}

const getRankomizedPosts = async (ctx: AppContext, existingRank: any, limit: number, gravity: number, userDid: string, config: CommunityRequestConfig) => {
    console.log(`getting ranked posts with drops`);
    const { userCommunity, expandPrefix, expandCommunities } = await getUserCommunities(ctx, userDid, config);

    const dropChance = 0.5;
    const dropQuery = `(case when score < 50 and rand() >= ${dropChance} then 1 else rand() end)`;
    let innerSelect = ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            //there's 50% chance for any post to get downranked to 1 like
            'post.uri', 'post.author', 'post.indexedAt', userCommunity.prefix,
            sql<string>`((score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank'),
            sql<string>`((score-1)*${dropQuery}/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rankwithdrops')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        // .where('post.replyParent', 'is', null)
        .orderBy('rankwithdrops', 'desc');

    if (expandPrefix && expandPrefix !== userCommunity.prefix) {
        innerSelect = innerSelect.select(expandPrefix);
    }

    let ranked = ctx.db
        .selectFrom([
            innerSelect.as('a')
        ])
        .selectAll()
        .limit(limit);

    if (existingRank) {
        ranked = ranked
            .where('rank', '<', existingRank)
    }

    if (expandPrefix && expandCommunities && expandCommunities.length > 0) {
        ranked = ranked
            .where((eb) => eb.or([
                eb(expandPrefix, 'in', expandCommunities),
                eb(userCommunity.prefix, '=', userCommunity.community),
            ]))
    } else {
        ranked = ranked
            .where(userCommunity.prefix, '=', userCommunity.community)
    }

    console.log(ranked.compile().sql);

    return await ranked.execute();
}

const getRankedPosts = async (ctx: AppContext, existingRank: any, limit: number, gravity: number, userDid: string, config: CommunityRequestConfig) => {
    console.log(`getting ranked posts`);
    const { userCommunity, expandPrefix, expandCommunities } = await getUserCommunities(ctx, userDid, config);

    let innerSelect = ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
            //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
            'post.uri', 'post.author', 'post.indexedAt', userCommunity.prefix,
            sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc');

    if (expandPrefix && expandPrefix !== userCommunity.prefix) {
        innerSelect = innerSelect.select(expandPrefix);
    }

    let ranked = ctx.db
        .selectFrom([
            innerSelect.as('a')
        ])
        .selectAll()
        .limit(limit);

    if (existingRank) {
        ranked = ranked
            .where('rank', '<', existingRank)
    }

    if (expandPrefix && expandCommunities && expandCommunities.length > 0) {
        ranked = ranked
            .where((eb) => eb.or([
                eb(expandPrefix, 'in', expandCommunities),
                eb(userCommunity.prefix, '=', userCommunity.community),
            ]))
    } else {
        ranked = ranked
            .where(userCommunity.prefix, '=', userCommunity.community)
    }

    console.log(ranked.compile().sql);

    return await ranked.execute();
}



const getUserCommunities = async (ctx: AppContext, userDid: string, config?: CommunityRequestConfig): Promise<{ userCommunity: { community: string, prefix: any }, expandPrefix: any, expandCommunities?: string[] }> => {
    const { whereClause, userCommunity, expandCommunities } = await getUserCommunity(ctx, userDid, config);
    //hack to avoid sql error
    //todo fix it later
    if (expandCommunities && expandCommunities.length > 0) {
        const expandPrefix = expandCommunities[0].substring(0, 1);
        return { userCommunity, expandPrefix, expandCommunities };
    } else {

        return { userCommunity, expandPrefix: 'o' };
    }
}

export { getUserCommunity, getUserCommunities, getFirstPagePosts, getRankomizedPosts, getRankedPosts, CommunityRequestConfig }