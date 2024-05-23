import { sql } from 'kysely'
import { AppContext } from '../../config'
import { createSecretKey } from 'crypto'

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
    userCommunity: string,
    topCommunitiesByLikes?: string[]
}

interface CommunityRequestConfig {
    mode?: 'auto' | 'constellation' | 'nebula'
    withTopLiked?: boolean
    withExplore?: boolean
}

const getUserCommunity = async (ctx: AppContext, userDid: string, config?: CommunityRequestConfig): Promise<CommunityResponse> => {
    const mode = config?.mode ?? "auto";
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647'}`.execute(ctx.db);

    let perfectCommunity;
    if (mode === "auto") {
        if (communitiesRes && communitiesRes.rows.length > 0) {
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

            perfectCommunity = (communities && communities.filter(community => community.size > 3000 && community.size < 50000)[0])
                ?? (communities && communities.filter(community => community.prefix === 's'))[0];

            console.log(perfectCommunity);
        }
    }

    if (mode === "constellation") {
        perfectCommunity = { community: (communitiesRes?.rows[0] as any)?.o, prefix: 'o' };
    }

    if (mode === "nebula") {
        perfectCommunity = { community: (communitiesRes?.rows[0] as any)?.e, prefix: 'e' };
    }

    console.log(`User community: ${perfectCommunity.community}`)

    const postDotCommunityPrefix: any = `post.${perfectCommunity ? perfectCommunity.prefix : 's'}`;
    const didToCommunityDotPrefix: any = `did_to_community.${perfectCommunity ? perfectCommunity.prefix : 's'}`;
    const community = perfectCommunity ? perfectCommunity.community : 's574';

    if (config?.withTopLiked) {
        const topLikedCommunitiesQuery = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select([didToCommunityDotPrefix, 'likescore.subject'])
            .where('likescore.author', '=', userDid)
            .where(didToCommunityDotPrefix, '<>', community)
            .orderBy('likescore.score', 'desc')
            .limit(mode === "auto" ? 5 : 10);

        console.log(topLikedCommunitiesQuery.compile().sql);

        const topLikedCommunities = await topLikedCommunitiesQuery.execute();

        const topCommunitiesByLikes: string[] = topLikedCommunities.filter(n => n[perfectCommunity.prefix] !== undefined).map(n => n[perfectCommunity.prefix]) as any;

        console.log("top communities: " + topCommunitiesByLikes)

        if (config?.withExplore) {
            if (topLikedCommunities && topLikedCommunities.length > 0) {
                const exploreCommunitiesQuery = ctx.db.selectFrom('likescore')
                    .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
                    .select([didToCommunityDotPrefix])
                    .where('likescore.author', 'in', topLikedCommunities.slice(0, 3).map(n => n.subject))
                    .where(didToCommunityDotPrefix, '<>', community)
                    .where(didToCommunityDotPrefix, 'not in', topCommunitiesByLikes)
                    .orderBy('likescore.score', 'desc')
                    .limit(10);

                console.log(exploreCommunitiesQuery.compile().sql);

                const exploreCommunities = await exploreCommunitiesQuery.execute();

                const exploreCommunitiesByLikes: string[] = exploreCommunities.filter(n => n[perfectCommunity.prefix] !== undefined).map(n => n[perfectCommunity.prefix]) as any;

                console.log("explore communities: " + exploreCommunitiesByLikes)

                return { whereClause: postDotCommunityPrefix, userCommunity: community, topCommunitiesByLikes: [...topCommunitiesByLikes, ...exploreCommunitiesByLikes] };
            }
        }

        return { whereClause: postDotCommunityPrefix, userCommunity: community, topCommunitiesByLikes: topCommunitiesByLikes };
    }

    return { whereClause: postDotCommunityPrefix, userCommunity: community };
}

const getRankomizedPosts = async (ctx: AppContext, limit: number, prefix: any, communities: string[]) => {
    const whereClause: any = `post.${prefix}`;
    let randomized = ctx.db
        .selectFrom('post')
        .selectAll()
        .select(({ fn, val, ref }) => [
            //NH ranking * rand(seed) - randomizes posts positions on every refresh while keeping them ~ranked
            //top posts are somewhat immune and, so adding extra protection from that:
            // if the post is popular (>50 likes) there's 90% chance it will get downranked to 10 likes so you don't see the same top liked post on top all the time
            sql<string>`((postrank.score-1)*(case when score > 50 and rand() > 0.8 then 1 else 10/(score-1) end)*rand()/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .where(whereClause, 'in', communities)
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .limit(limit);

    console.log(randomized.compile().sql);

    return await randomized.execute();
}

const getRankedPosts = async (ctx: AppContext, existingRank: number, limit: number, prefix: any, gravity: number, communities: string[]) => {
    let ranked = ctx.db
        .selectFrom([
            ctx.db.selectFrom('post')
                .select(({ fn, val, ref }) => [
                    //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
                    'post.uri', 'post.author', prefix,
                    sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,${gravity}))`.as('rank')
                ])
                .innerJoin('postrank', 'post.uri', 'postrank.uri')
                .select(['postrank.score'])
                // .where('post.replyParent', 'is', null)
                .orderBy('rank', 'desc')
                .as('a')
        ])
        .selectAll()
        .where(prefix, 'in', communities)
        .limit(limit);

    if (existingRank) {
        ranked = ranked
            .where('rank', '<', existingRank)
    }

    console.log(ranked.compile().sql);

    return await ranked.execute();
}

const getUserCommunities = async (ctx: AppContext, userDid: string, config?: CommunityRequestConfig): Promise<{ communities: string[], prefix: string }> => {
    const { whereClause, userCommunity, topCommunitiesByLikes } = await getUserCommunity(ctx, userDid, config);
    const prefix = userCommunity.substring(0, 1);
    if (topCommunitiesByLikes && topCommunitiesByLikes.length > 0) {
        return { communities: [userCommunity, ...topCommunitiesByLikes], prefix };
    } else {
        return { communities: [userCommunity], prefix };
    }
}

export { getUserCommunity, getUserCommunities, getRankomizedPosts, getRankedPosts, Prefixes }