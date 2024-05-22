import { sql } from 'kysely'
import { AppContext } from '../../config'

interface CommunityResponse {
    whereClause: any,
    userCommunity: string,
    topConstellationsByLikes?: string[]
}

const getUserCommunity = async (ctx: AppContext, userDid: string, config: { withTopLiked: boolean }): Promise<CommunityResponse> => {
    const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647'}`.execute(ctx.db);

    let perfectCommunity;
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
    const whereClause: any = `post.${perfectCommunity ? perfectCommunity.prefix : 's'}`;
    const community = perfectCommunity ? perfectCommunity.community : 's574';

    if (config.withTopLiked) {
        const topLikedAuthors = ctx.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select(['did_to_community.o', 'likescore.subject'])
            .where('likescore.author', '=', userDid)
            .where(whereClause, '<>', community)
            .limit(5);

        console.log(topLikedAuthors.compile().sql);

        const topLikedConstellations = await topLikedAuthors.execute();

        const topConstellationsByLikes: string[] = topLikedConstellations.filter(n => n.o !== undefined).map(n => n.o) as any;

        return { whereClause, userCommunity: community, topConstellationsByLikes };
    }

    return { whereClause, userCommunity: community };
}

// let exploreNebulae;
// if (topLikedNebulae && topLikedNebulae.length > 0) {
//     exploreNebulae = await ctx.db.selectFrom('likescore')
//         .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
//         .select(['did_to_community.e'])
//         .where('likescore.author', 'in', topLikedNebulae.map(n => n.subject))
//         .where(whereClause, '<>', perfectCommunity.community)
//         .limit(5)
//         .execute();
// }

export { getUserCommunity }