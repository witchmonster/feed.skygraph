import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import fetch from 'node-fetch';

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      if (post.record.text.includes('і'))
        console.log(post.record.text)
    }

    for (const like of ops.likes.creates) {
      // if (like.author.startsWith('did:plc:'))
      // console.log(like.uri)
    }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // all posts
        return true;
      })
      .map((create) => {
        // map posts to db row
        return {
          uri: create.uri,
          cid: create.cid,
          author: create.author,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date(create.record.createdAt).toISOString().substring(0, 19),
        }
      })

    // const repostsToDelete = ops.reposts.deletes.map((del) => del.uri)
    // const repostsToCreate = ops.reposts.creates
    //   .filter((create) => {
    //     // all reposts
    //     return true;
    //   })
    //   .map((create) => {
    //     // map posts to db row
    //     return {
    //       uri: create.uri,
    //       cid: create.cid,
    //       author: create.author,
    //       replyParent: null,
    //       replyRoot: null,
    //       repostSubject: create.record.subject.uri,
    //       indexedAt: new Date(create.record.createdAt).toISOString().substring(0, 19),
    //     }
    //   })

    const likesToCreate = ops.likes.creates
      .filter((create) => {
        return true;
      })
      .map((create) => {
        return {
          author: create.author,
          subject: create.record.subject.uri.split('/')[2],
          score: 1,
        }
      })
    const rankToCreate = ops.likes.creates
      .filter((create) => {
        return true;
      })
      .map((create) => {
        return {
          uri: create.record.subject.uri,
          score: 1,
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      const communities = await this.db
        .selectFrom('did_to_community')
        .selectAll()
        .where('did_to_community.did', 'in', postsToCreate.map(post => post.author))
        .execute();

      const communityObj: {
        [did: string]: {
          did?: string,
          f: string,
          s: string,
          c: string,
          g: string,
          e: string,
          o: string
        }
      } = communities.reduce((a, v) => ({ ...a, [v.did]: v }), {})
      if (communities?.length === postsToCreate.length) {
        const values = postsToCreate.map(post => {
          let postWithCommunitiesreturn = { ...post, ...communityObj[post.author] };
          delete postWithCommunitiesreturn.did;
          return postWithCommunitiesreturn;
        });
        await this.db
          .insertInto('post')
          .values(values)
          .ignore()
          .execute()
      } else {
        await this.db
          .insertInto('post')
          .values(postsToCreate)
          .ignore()
          .execute()
      }
    }
    // if (repostsToDelete.length > 0) {
    //   await this.db
    //     .deleteFrom('post')
    //     .where('uri', 'in', repostsToDelete)
    //     .execute()
    // }
    // if (repostsToCreate.length > 0) {
    //   const communities = await this.db
    //     .selectFrom('did_to_community')
    //     .selectAll()
    //     .where('did_to_community.did', 'in', repostsToCreate.map(post => post.author))
    //     .execute();

    //   const communityObj: {
    //     [did: string]: {
    //       did?: string,
    //       f: string,
    //       s: string,
    //       c: string,
    //       g: string,
    //       e: string,
    //       o: string
    //     }
    //   } = communities.reduce((a, v) => ({ ...a, [v.did]: v }), {})
    //   if (communities?.length === repostsToCreate.length) {
    //     const values = repostsToCreate.map(repost => {
    //       let postWithCommunitiesreturn = { ...repost, ...communityObj[repost.author] };
    //       delete postWithCommunitiesreturn.did;
    //       return postWithCommunitiesreturn;
    //     });
    //     await this.db
    //       .insertInto('post')
    //       .values(values)
    //       .ignore()
    //       .execute()
    //   } else {
    //     await this.db
    //       .insertInto('post')
    //       .values(repostsToCreate)
    //       .ignore()
    //       .execute()
    //   }
    // }
    if (likesToCreate.length > 0) {
      await this.db
        .insertInto('likescore')
        .values(likesToCreate)
        .onDuplicateKeyUpdate((eb) => ({
          score: eb('score', '+', 1)
        }))
        .execute()
      await this.db
        .insertInto('postrank')
        .values(rankToCreate)
        .onDuplicateKeyUpdate((eb) => ({
          score: eb('score', '+', 1)
        }))
        .execute()
    }
  }
}
