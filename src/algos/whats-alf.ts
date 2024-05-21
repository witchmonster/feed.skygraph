import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'
import { sql } from 'kysely'

// max 15 chars
export const shortname = 'test'

export const handler = async (ctx: AppContext, params: QueryParams, userDid: string) => {
  //ranking draft
  // select p.uri, r.score, TIMESTAMPDIFF(SECOND,p.indexedAt,now())/60 as minutesAgo, ((r.score-1) / power(timestampdiff(second,p.indexedAt,now())/60,2))*rand(42) as hn from post as p join did_to_community as cd on p.author = cd.did join postrank as r on p.uri = r.uri where cd.s='s574' order by hn desc limit 20;

  // select
  // p.uri,
  // r.score,
  // TIMESTAMPDIFF(SECOND,NOW(),STR_TO_DATE(SUBSTRING(p.indexedAt from 1 for 19),'%Y-%m-%dT%TZ'))/3600 as hoursAgo
  // from post as p
  // join did_to_community as cd on p.author = cd.did join postrank as r on p.uri = r.uri where cd.c='c203'
  // order by r.score desc
  // limit 1000;

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
          //NH ranking * rand(seed) - randomizes posts positions on every refresh while keeping them ~ranked
          //top posts are somewhat immune and, so adding extra protection from that:
          // if the post is popular (>50 likes) there's 70% chance it will get downranked to 10 likes so you don't see the same top liked post on top all the time
          'post.uri',
          sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,3))`.as('rank')
          // sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))*(case when score > 50 and rand(${seed}) > 0.6 then 1 else 10/(score-1) end)*rand(${seed}))`.as('rank')
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
      .orderBy(sql`rand(${seed})`, 'desc')

  console.log(builder.compile().sql);

  const res = await builder.execute();

  console.log(`${res.length}`);

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = `${seed}::${last.rank}`
  }

  return {
    cursor,
    feed,
  }
}
