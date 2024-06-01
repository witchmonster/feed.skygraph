import type {
    AtpAgentLoginOpts,
    AtpAgentOpts,
    AppBskyFeedPost,
    AppBskyEmbedImages,
} from "@atproto/api";
import { AtUri, BskyAgent, RichText } from "@atproto/api";
import { createDb, Database, migrateToLatest } from '../db'
import { CronJob } from 'cron';
import { BotCommand } from "../db/schema";
import { ReplyRef } from "../lexicon/types/app/bsky/feed/post";
import { sql } from "kysely";
import { DidResolver, MemoryCache } from "@atproto/identity";
import { getUserCommunities, sliceCommunityResponse } from "../algos/common/communities";
import { config as mygalaxyPlusConfig, feedname as mygalaxyPlusName } from "../algos/feeds/mygalaxyplus";
import { config as myNebulaPlusConfig, feedname as mynebulaPlusName } from "../algos/feeds/mynebulaplus";


const BSKY_SERVICE = "https://bsky.social";

export const bskyService = BSKY_SERVICE;

const communityTypes = {
    'f': "Gigacluster",
    's': "Supercluster",
    'c': "Cluster",
    'g': "Galaxy",
    'e': "Nebula",
    'o': "Constellation"
}

const communityHearts = {
    'f': "🖤",
    's': "💚",
    'c': "🧡",
    'g': "🩷",
    'e': "🩵",
    'o': "💜"
}

const feedMap = {
    "mygalaxy+": {
        config: mygalaxyPlusConfig,
        name: mygalaxyPlusName,
        communityNoun: "Nebula",
        communityPlural: "Nebulas"
    },
    "mynebula+": {
        config: myNebulaPlusConfig,
        name: mynebulaPlusName,
        communityNoun: "Constellation",
        communityPlural: "Constellations"
    }
};

export type BotOptions = {
    service: string | URL;
    dryRun: boolean;
};

export default class Bot {
    #agent: BskyAgent;
    db: Database;
    cronJob: CronJob;
    didResolver: DidResolver;

    static keyword: string = "!skygraphbot";
    static commands = ['whereami', 'showcommunity', 'showfeed'];

    static defaultOptions: BotOptions = {
        service: bskyService,
        dryRun: false,
    } as const;


    botCommands = {
        "whereami": async (command: BotCommand) => {
            try {
                const communities = await this.db.selectFrom('did_to_community')
                    .select(['f', 's', 'c', 'g', 'e', 'o'])
                    .where('did', '=', command.user)
                    .executeTakeFirst();

                let replyText;
                if (!communities) {
                    replyText = `I'm sorry, your account was not found in any of the communities`
                } else {
                    replyText = `Your communities:

    🖤 Gigacluster: ${communities.f}
    💚 Supercluster: ${communities.s}
    🧡 Cluster: ${communities.c}
    🩷 Galaxy: ${communities.g}
    🩵 Nebula: ${communities.e}
    💜 Constellation: ${communities.o}

🤖💡:

!skygraphbot showcommunity ${communities.o}

!skygraphbot showfeed mygalaxy+

!skygraphbot showfeed mynebula+`;
                }

                const replyToUrip = new AtUri(command.uri)
                const replyTo = await this.#agent.getPost({
                    repo: replyToUrip.host,
                    rkey: replyToUrip.rkey
                })
                const parentRef = {
                    uri: replyTo.uri,
                    cid: replyTo.cid
                }

                await this.reply(replyText, {
                    root: replyTo.value.reply?.root || parentRef,
                    parent: parentRef
                });

                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'finished'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            } catch (err) {
                console.log(err);
                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'error'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            }

        },
        "showcommunity": async (command: BotCommand) => {
            try {
                const community = command.value;
                const prefix: any = community?.substring(0, 1);

                let replyText;
                if (!community || !prefix) {
                    replyText = `I'm sorry, could not find this community.`
                } else {
                    const communityRes = await this.db.selectFrom('community')
                        .selectAll()
                        .where('community', '=', community)
                        .executeTakeFirst();

                    if (!communityRes) {
                        replyText = `I'm sorry, could not find this community.`
                    } else {

                        const posts = await this.db.selectFrom('post')
                            .innerJoin('postrank', 'post.uri', 'postrank.uri')
                            .select(({ fn, val, ref }) => [
                                'post.author', 'post.uri',
                                sql<string>`sum((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
                            ])
                            .where(prefix, '=', community)
                            .limit(5)
                            .groupBy('post.author')
                            .orderBy('rank', 'desc')
                            .execute();

                        // const postTexts = posts.map(async post => {
                        //     const postToUrip = new AtUri(post.uri)
                        //     const contentRes = await this.#agent.getPost({
                        //         repo: postToUrip.host,
                        //         rkey: postToUrip.rkey
                        //     });
                        //     return contentRes.value.text;
                        // });

                        // const wordcloudLink = `${wordcloud}${postTexts[0]}`;

                        const links = await this.resolveHandles(posts.slice(0, 5).map(post => post.author));

                        replyText = `Type: ${communityHearts[prefix]} ${communityTypes[prefix]}

                        👯Polulation: ${communityRes?.size}

💬Top recent posters: ${links}`;
                    }
                }

                const replyToUrip = new AtUri(command.uri)
                const replyTo = await this.#agent.getPost({
                    repo: replyToUrip.host,
                    rkey: replyToUrip.rkey
                })
                const parentRef = {
                    uri: replyTo.uri,
                    cid: replyTo.cid
                }

                await this.reply(replyText, {
                    root: replyTo.value.reply?.root || parentRef,
                    parent: parentRef
                });

                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'finished'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            } catch (err) {
                console.log(err);
                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'error'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            }

        },
        "showfeed": async (command: BotCommand) => {
            try {
                let replyText;
                if (!command.value || !feedMap[command.value]) {
                    replyText = `I'm sorry, no such feed exists.`
                } else {
                    const communities = await getUserCommunities(this.db, [], command.user, feedMap[command.value].config.communityConfig)

                    const homeSlice = sliceCommunityResponse(communities, feedMap[command.value].config.homeCommunities);
                    const discoverSlice = sliceCommunityResponse(communities, feedMap[command.value].config.discoverCommunities, feedMap[command.value].config.homeCommunities);
                    const totalCommunities = communities.topCommunitiesByLikes.communities.length + communities.exploreCommunitiesByLikes.communities.length;
                    const notEnoughCommunities = totalCommunities < feedMap[command.value].config.communityConfig.totalCommunities;
                    const homeCommunities = [communities.userCommunity.community, ...homeSlice.topCommunitiesByLikes.communities, ...homeSlice.exploreCommunitiesByLikes.communities]
                    const dicoverCommunities: string[] = [];
                    if (notEnoughCommunities) {
                        dicoverCommunities.push(communities.exploreCommunity.community);
                    }
                    dicoverCommunities.push(...discoverSlice.topCommunitiesByLikes.communities, ...discoverSlice.exploreCommunitiesByLikes.communities);

                    replyText = `📍You: ${communities.userCommunity.community}

📰${feedMap[command.value].name} ${feedMap[command.value].communityPlural}:

🏠Home (${feedMap[command.value].config.discoverPostsRate - 1}/${feedMap[command.value].config.discoverPostsRate}): ${homeCommunities}

🗺️Discover (1/${feedMap[command.value].config.discoverPostsRate}): ${dicoverCommunities}

🤖💡:

!skygraphbot showcommunity ${communities.userCommunity.community}
`;

                }

                const replyToUrip = new AtUri(command.uri)
                const replyTo = await this.#agent.getPost({
                    repo: replyToUrip.host,
                    rkey: replyToUrip.rkey
                })
                const parentRef = {
                    uri: replyTo.uri,
                    cid: replyTo.cid
                }

                await this.reply(replyText, {
                    root: replyTo.value.reply?.root || parentRef,
                    parent: parentRef
                });

                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'finished'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            } catch (err) {
                console.log(err);
                await this.db.updateTable('bot_commands')
                    .set({
                        status: 'error'
                    })
                    .where('user', '=', command.user)
                    .where('uri', '=', command.uri)
                    .execute();
            }

        }
    };

    constructor(service: AtpAgentOpts["service"]) {
        this.#agent = new BskyAgent({ service });
        this.db = createDb();
        this.cronJob = new CronJob('*/1 * * * * *', async () => {
            try {
                await this.processCommands();
            } catch (e) {
                console.error(e);
            }
        });
        this.didResolver = new DidResolver({
            plcUrl: 'https://plc.directory',
            didCache: new MemoryCache(),
        })
    }

    login(loginOpts: AtpAgentLoginOpts) {
        return this.#agent.login(loginOpts);
    }

    async resolveHandles(dids: string[]) {
        const handles: string[] = [];
        for (let i = 0; i < dids.length; i++) {
            const data = await this.didResolver.resolveAtprotoData(dids[i]);
            handles.push(`
${data.handle}`);
        }
        return handles;
    }

    async reply(
        text: string,
        reply: ReplyRef,
        embedImage?: AppBskyEmbedImages.Main
    ) {
        const richText = new RichText({ text });
        await richText.detectFacets(this.#agent);
        const record: (Partial<AppBskyFeedPost.Record> &
            Omit<AppBskyFeedPost.Record, "createdAt">) = {
            text: richText.text,
            facets: richText.facets,
            reply: reply,
            embed: embedImage
        };
        return this.#agent.post(record);
    }

    async processCommands() {
        const commands = await this.db.selectFrom('bot_commands')
            .selectAll()
            .where('status', '=', 'created')
            .execute();

        commands.forEach(async row => {
            await this.db.updateTable('bot_commands')
                .set({
                    status: 'processing'
                })
                .where('user', '=', row.user)
                .where('uri', '=', row.uri)
                .execute();
            await this.botCommands[row.command](row);
        });
    }

    async start() {
        await migrateToLatest(this.db);
        this.cronJob.start();
        return;
    }
}