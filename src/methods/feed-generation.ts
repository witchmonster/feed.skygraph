import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'
import { AtpAgent } from '@atproto/api'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    // const bearer = req.headers?.authorization;
    // try {
    //   if (bearer) {
    //     const jwt: any = jose.decodeJwt(bearer.split(' ')[1]);
    //     const did = jwt.iss;
    //     if (did) {
    //       const account = await db.selectFrom('Account').where('did', '=', did).selectAll().executeTakeFirst();
    //       if (account) {
    //         return await algoAllPlus(did, query.cursor);
    //       }
    //     }
    //   }
    // } catch (e) {
    //   console.error('ALL+ FEED ERROR', bearer, e);
    // }
    const feedUri = new AtUri(params.feed)
    const algo = algos[feedUri.rkey];
    if (
      (feedUri.hostname !== 'did:plc:v7iswx544swf2usdcp32p647' && feedUri.hostname !== 'did:plc:o5aohupqzlzcmddhgatk4ty7') ||
      feedUri.collection !== 'app.bsky.feed.generator' ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      )
    }
    /**
     * Example of how to check auth if giving user-specific results:
     *
     * const requesterDid = await validateAuth(
     *   req,
     *   ctx.cfg.serviceDid,
     *   ctx.didResolver,
     * )
     */

    let requesterDid;
    if (req.headers?.authorization) {
      requesterDid = await validateAuth(
        req,
        ctx.cfg.serviceDid,
        ctx.didResolver,
      )
    }

    let follows;
    if (requesterDid) {
      const agent = new AtpAgent({ service: 'https://bsky.social' })
      const handle = process.env.BSKY_USER;
      const password = process.env.BSKY_PASSWORD;

      if (handle && password) {
        await agent.login({ identifier: handle, password })
        const response = await agent.api.app.bsky.graph.getFollows({ actor: requesterDid });
        follows = response.data.follows.map(follow => follow.did);
      }
    }

    const body = await algo(ctx, params, requesterDid, follows)
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
