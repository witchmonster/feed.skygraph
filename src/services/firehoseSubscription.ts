import { BotCommand } from '../db/schema'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from '../lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from '../util/subscription'
import Bot from './bot'

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

    const getBotInstruction = (text: string): { command: string, value?: string } | undefined => {
      if (!text.startsWith(Bot.keyword)) {
        return undefined;
      } else {
        const split = text.split(' ');
        if (!split || split.length < 2) {
          return undefined;
        }

        console.log(`Keyword: ${Bot.keyword}`);
        console.log(split);
        const command = split[1];
        console.log(`Command exists: ${command}:${Bot.commands.includes(command)}`);
        const value = split[2];
        console.log(value);
        const result: { command: string, value?: string } = { command }
        if (value) {
          result.value = value;
        }
        return Bot.commands.includes(command) ? result : undefined;
      }
    }
    const botInstructions: BotCommand[] = ops.posts.creates
      .filter((create) => {
        // all posts
        return getBotInstruction(create.record.text.toLowerCase()) !== undefined;
      })
      .map((create) => {
        // map posts to db row
        const postText = create.record.text.toLowerCase();
        const instruction: any = getBotInstruction(postText);
        const insert: BotCommand = {
          user: create.author,
          uri: create.uri,
          command: instruction.command,
          status: 'created',
          createdAt: new Date(create.record.createdAt).toISOString().substring(0, 19),
        }

        if (instruction.value) {
          insert.value = instruction.value;
        }

        return insert;
      });

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

      const communityMap: {
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
          let postWithCommunitiesreturn = { ...post, ...communityMap[post.author], ...{ version: 'v4' } };
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
    if (botInstructions.length > 0) {
      await this.db.insertInto('bot_commands')
        .values(botInstructions)
        .execute();
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
      const fromCommunities = await this.db
        .selectFrom('did_to_community')
        .select(['did_to_community.did', 'did_to_community.f', 'did_to_community.s', 'did_to_community.c', 'did_to_community.g', 'did_to_community.e', 'did_to_community.o'])
        .where('did_to_community.did', 'in', likesToCreate.map(like => like.author))
        .execute();

      const toCommunities = await this.db
        .selectFrom('did_to_community')
        .select(['did_to_community.did', 'did_to_community.f', 'did_to_community.s', 'did_to_community.c', 'did_to_community.g', 'did_to_community.e', 'did_to_community.o'])
        .where('did_to_community.did', 'in', likesToCreate.map(like => like.subject))
        .execute();

      const fromCommunityMap: {
        [did: string]: {
          did?: string,
          from_f: string,
          from_s: string,
          from_c: string,
          from_g: string,
          from_e: string,
          from_o: string,
        }
      } = fromCommunities.reduce((a, v) => ({ ...a, [v.did]: { did: v.did, from_f: v.f, from_s: v.s, from_c: v.c, from_g: v.g, from_e: v.e, from_o: v.o } }), {});
      const toCommunityMap: {
        [did: string]: {
          did?: string,
          to_f: string,
          to_s: string,
          to_c: string,
          to_g: string,
          to_e: string,
          to_o: string,
        }
      } = toCommunities.reduce((a, v) => ({ ...a, [v.did]: { did: v.did, to_f: v.f, to_s: v.s, to_c: v.c, to_g: v.g, to_e: v.e, to_o: v.o } }), {});

      if (fromCommunities?.length === likesToCreate.length && toCommunities?.length === likesToCreate.length) {
        const values = likesToCreate.map(like => {
          let likesWithCommunitiesreturn = { ...like, ...fromCommunityMap[like.author], ...toCommunityMap[like.subject], ...{ version: 'v4' } };
          delete likesWithCommunitiesreturn.did;
          return likesWithCommunitiesreturn;
        });
        await this.db
          .insertInto('likescore')
          .values(values)
          .onDuplicateKeyUpdate((eb) => ({
            score: eb('score', '+', 1),
            version: 'v4'
          }))
          .execute()
      } else {
        await this.db
          .insertInto('likescore')
          .values(likesToCreate)
          .onDuplicateKeyUpdate((eb) => ({
            score: eb('score', '+', 1),
            version: 'v4'
          }))
          .execute()
      }
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
