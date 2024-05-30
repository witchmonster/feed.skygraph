import { InternalServerError, InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'

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
      (feedUri.hostname !== process.env.FEEDGEN_PUBLISHER_DID && feedUri.hostname !== process.env.FEEDGEN_TEST_PUBLISHER_DID) ||
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

    if (!requesterDid) {
      //hack, todo: inject this properly
      if (feedUri.hostname === process.env.FEEDGEN_TEST_PUBLISHER_DID) {
        requesterDid = process.env.TEST_DEFAULT_FEED_USER_DID
      }
      if (feedUri.hostname === process.env.FEEDGEN_PUBLISHER_DID) {
        requesterDid = process.env.DEFAULT_FEED_USER_DID
      }
    }

    //override user for test feed (uncomment when testing)
    // if (feedUri.hostname === process.env.FEEDGEN_TEST_PUBLISHER_DID) {
    //   requesterDid = process.env.TEST_DEFAULT_FEED_USER_DID
    // }

    let follows;
    try {
      if (requesterDid) {
        const response = await ctx.agent.api.app.bsky.graph.getFollows({ actor: requesterDid });
        follows = response.data.follows.map(follow => follow.did);
      }
    } catch (err) {
      console.log(`Couldn't get follows.`)
    }

    let body;
    try {
      body = await algo(ctx, params, requesterDid, follows)
    } catch (err) {
      throw new InternalServerError(
        err,
        'FeedGeneratorFailed',
      )
    }
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
