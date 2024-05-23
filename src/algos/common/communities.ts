import { sql } from 'kysely'
import { AppContext } from '../../config'
import { createSecretKey } from 'crypto'

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

export { getUserCommunity }