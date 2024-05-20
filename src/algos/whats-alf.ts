import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// max 15 chars
export const shortname = 'test'

export const handler = async (ctx: AppContext, params: QueryParams) => {
  //ranking draft
  // select @n := @n + 1 n, p.uri, r.score, TIMESTAMPDIFF(SECOND,p.indexedAt,now())/60 as minutesAgo, (power((r.score-1),3) / power(timestampdiff(second,p.indexedAt,now())/60,2)) as hn from post as p join did_to_community as cd on p.author = cd.did join postrank as r on p.uri = r.uri, (SELECT @n := 0) as m where cd.c='c203' order by (power((r.score-1),3) / power(timestampdiff(second,p.indexedAt,now())/60,2))*rand() desc limit 200;

  // select
  // p.uri,
  // r.score,
  // TIMESTAMPDIFF(SECOND,NOW(),STR_TO_DATE(SUBSTRING(p.indexedAt from 1 for 19),'%Y-%m-%dT%TZ'))/3600 as hoursAgo
  // from post as p
  // join did_to_community as cd on p.author = cd.did join postrank as r on p.uri = r.uri where cd.c='c203'
  // order by r.score desc
  // limit 1000;
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .innerJoin('did_to_community', 'post.author', 'did_to_community.did')
    .innerJoin('postrank', 'post.uri', 'postrank.uri')
    .where('did_to_community.c', '=', 'c203')
    .orderBy('score', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const [indexedAt, cid] = params.cursor.split('::')
    if (!indexedAt || !cid) {
      throw new InvalidRequestError('malformed cursor')
    }
    const timeStr = new Date(parseInt(indexedAt, 10)).toISOString()
    builder = builder
      .where((eb) => eb.or([
        eb('post.indexedAt', '<', timeStr),
        eb('post.indexedAt', '=', timeStr)
      ]))
      .where('post.cid', '<', cid)
  }
  const res = await builder.execute();

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
  }

  return {
    cursor,
    feed,
  }
}
