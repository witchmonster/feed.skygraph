import { sql } from 'kysely'
import { AppContext } from '../../config'
import { createSecretKey } from 'crypto'

interface CommunityResponse {
    whereClause: any,
    userCommunity: string,
    topConstellationsByLikes?: string[]
}

interface CommunityRequestConfig {
    mode?: 'auto' | 'constellation'
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

    console.log(`User community: ${perfectCommunity.community}`)

    const whereClausePost: any = `post.${perfectCommunity ? perfectCommunity.prefix : 's'}`;
    const whereClauseDidToCommunity: any = `did_to_community.${perfectCommunity ? perfectCommunity.prefix : 's'}`;
    const community = perfectCommunity ? perfectCommunity.community : 's574';

    if (config?.withTopLiked) {
        const topLikedConstellationsQuery = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select(['did_to_community.o', 'likescore.subject'])
            .where('likescore.author', '=', userDid)
            .where(whereClauseDidToCommunity, '<>', community)
            .orderBy('likescore.score', 'desc')
            .limit(mode === "auto" ? 5 : 10);

        console.log(topLikedConstellationsQuery.compile().sql);

        const topLikedConstellations = await topLikedConstellationsQuery.execute();

        const topConstellationsByLikes: string[] = topLikedConstellations.filter(n => n.o !== undefined).map(n => n.o) as any;

        console.log("top constellations: " + topConstellationsByLikes)

        if (config?.withExplore) {
            if (topLikedConstellations && topLikedConstellations.length > 0) {
                const exploreConstellationsQuery = ctx.db.selectFrom('likescore')
                    .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
                    .select(['did_to_community.o'])
                    .where('likescore.author', 'in', topLikedConstellations.slice(0, 3).map(n => n.subject))
                    .where(whereClauseDidToCommunity, '<>', community)
                    .where('did_to_community.o', 'not in', topConstellationsByLikes)
                    .orderBy('likescore.score', 'desc')
                    .limit(10);

                console.log(exploreConstellationsQuery.compile().sql);

                const exploreConstellations = await exploreConstellationsQuery.execute();

                const exploreConstellationsByLikes: string[] = exploreConstellations.filter(n => n.o !== undefined).map(n => n.o) as any;

                console.log("explore constellations: " + exploreConstellationsByLikes)

                return { whereClause: whereClausePost, userCommunity: community, topConstellationsByLikes: [...topConstellationsByLikes, ...exploreConstellationsByLikes] };
            }
        }

        return { whereClause: whereClausePost, userCommunity: community, topConstellationsByLikes };
    }

    return { whereClause: whereClausePost, userCommunity: community };
}

export { getUserCommunity }