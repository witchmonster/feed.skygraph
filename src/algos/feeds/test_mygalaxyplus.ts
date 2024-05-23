import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../../config'
import { sql } from 'kysely'
import { getUserCommunity } from '../common/communities'
import { rateLimit } from '../common/util'

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
  console.log(`User ${userDid} from test_mygalaxyplus feed`);

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

  const { whereClause, userCommunity } = await getUserCommunity(ctx, userDid, { withTopLiked: false });

  let builder = ctx.db
    .selectFrom([
      ctx.db.selectFrom('post')
        .select(({ fn, val, ref }) => [
          //NH ranking: https://medium.com/hacking-and-gonzo/how-hacker-news-ranking-algorithm-works-1d9b0cf2c08d
          'post.uri', 'post.author',
          sql<string>`((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,3))`.as('rank')
        ])
        .innerJoin('postrank', 'post.uri', 'postrank.uri')
        .select(['postrank.score'])
        .where(whereClause, '=', userCommunity)
        // .where('post.replyParent', 'is', null)
        .orderBy('rank', 'desc')
        .as('a')
    ])
    .selectAll()
    .limit(params.limit);

  if (existingRank) {
    builder = builder
      .where('rank', '<', existingRank)
  }

  const consistentRes = await builder.execute();

  console.log(`${consistentRes.length}`);
  shuffleArray(consistentRes);

  const rateLimitedRes = rateLimit(consistentRes, 3);
  console.log(`rate limited to: ${rateLimitedRes.length}`);

  const feed = rateLimitedRes.map((row) => ({
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
