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
        // return create.record.text.match('^[А-Яа-яёЁЇїІіЄєҐґ]+$');
      })
      .map((create) => {
        // map posts to db row
        return {
          uri: create.uri,
          cid: create.cid,
          author: create.author,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

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
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .ignore()
        .execute()
    }
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
