import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'test'

function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string) => {
  console.log(userDid);

  const communitiesRes = await sql`select f, s, c, g, e, o from did_to_community where did = ${userDid ? userDid : 'did:plc:v7iswx544swf2usdcp32p647'}`.execute(ctx.db);
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
    ?? (communitiesRes.rows[0] as any)?.s;

  console.log(perfectCommunity);
  const whereClause: any = `did_to_community.${perfectCommunity.prefix}`;

  let seed: number;
  let existingRank;
  if (params.cursor) {
    const [passedSeed, rank] = params.cursor.split('::')
    existingRank = rank;
    if (!passedSeed || !rank) {
      throw new InvalidRequestError('malformed cursor')
    }
    seed = +passedSeed;
  } else {
    seed = new Date().getUTCMilliseconds();
  }

  console.log(`${seed}::${existingRank}`);

  let innerSelect = ctx.db
    .selectFrom([
      ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
          //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
          'post.uri',
          sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,3))`.as('rank')
        ])
        .innerJoin('did_to_community', 'post.author', 'did_to_community.did')
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        .where(whereClause, '=', perfectCommunity.community)
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .as('a')
    ])
    .selectAll()
    .limit(params.limit);

  if (existingRank) {
    innerSelect = innerSelect
      .where('rank', '<', existingRank)
  }

  let builder =
    ctx.db
      .selectFrom([
        innerSelect.as('r')
      ])
      .selectAll()

  const consistentRes = await builder.execute();

  console.log(`${consistentRes.length}`);

  //feed feels less boring this way
  shuffleArray(consistentRes);

  const feed = consistentRes.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = consistentRes.at(-1);
  if (last) {
    cursor = `${seed}::${last.rank}`
  }

  return {
    cursor,
    feed,
  }
}
