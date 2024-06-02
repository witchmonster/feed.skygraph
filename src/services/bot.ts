import type {
    AtpAgentLoginOpts,
    AtpAgentOpts,
    AppBskyFeedPost,
    AppBskyEmbedImages,
} from "@atproto/api";
import { AtUri, BskyAgent, RichText } from "@atproto/api";
import { createDb, Database, migrateToLatest } from '../db'
import { CronJob } from 'cron';
import { BotCommand, FeedOverrides } from "../db/schema";
import { ReplyRef } from "../lexicon/types/app/bsky/feed/post";
import { sql } from "kysely";
import { DidResolver, MemoryCache } from "@atproto/identity";
import { getUserCommunities, sliceCommunityResponse } from "../algos/common/communities";
import { config as mygalaxyPlusConfig } from "../algos/feeds/mygalaxyplus";
import { config as myNebulaPlusConfig } from "../algos/feeds/mynebulaplus";
import { text } from "stream/consumers";
import { shortname } from "../algos/feeds/test_mygalaxyplus";


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
        name: mygalaxyPlusConfig.feedName,
        shortname: mygalaxyPlusConfig.shortName,
        communityNoun: "Nebula",
        communityPlural: "Nebulas"
    },
    "mynebula+": {
        config: myNebulaPlusConfig,
        name: myNebulaPlusConfig.feedName,
        shortname: myNebulaPlusConfig.shortName,
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

    // static keyword: string = "!skygraphtest";
    static keyword: string = "!skygraphbot";
    static commands = ['whereami', 'showcommunity', 'showfeed', 'opt'];

    static defaultOptions: BotOptions = {
        service: bskyService,
        dryRun: false,
    } as const;


    botCommands = {
        "whereami": async (command: BotCommand) => {
            const whereami = async () => {
                const communities = await this.db.selectFrom('did_to_community')
                    .select(['f', 's', 'c', 'g', 'e', 'o'])
                    .where('did', '=', command.user)
                    .executeTakeFirst();

                if (!communities) {
                    return `I'm sorry, your account was not found in any of the communities`
                } else {
                    return `Your communities:

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
            }

            await this.executeAndReply(whereami, command);

        },
        "opt": async (command: BotCommand) => {
            const optedOutText = `You are opted out of SkyGraph feeds.

Your content won't be shown in My Nebula+/My Galaxy+ feeds and you won't be shown personalized content.

To opt out of SkyGraph dataset and map: @optout.skygraph.art

To opt back in:

!skygraphbot opt in`;

            const optedInText = `You are opted in to SkyGraph My Nebula+/My Galaxy+ feeds.

Both feeds are showing you personalized content based on your likes and prior interactions.

To opt out:

!skygraphbot opt out`;
            const optBackInText = `Welcome back! You've been opted back in to SkyGraph My Nebula+/My Galaxy+ feeds.`;
            if (command.value !== 'in' && command.value !== 'out' && command.value !== 'status') {
                return `I'm sorry, this is not a valid command. Please use 'opt status', 'opt in' or 'opt out'.`
            }
            const opt = async () => {
                const current = await this.db.selectFrom('feed_overrides')
                    .selectAll()
                    .where('user', '=', command.user)
                    .executeTakeFirst();

                if (current && current.optout && command.value === 'out') {
                    return optedOutText;
                }
                if (current && !current.optout && command.value === 'in') {
                    return optedInText;
                }
                if (command.value === 'status') {
                    return current
                        ? current.optout ? optedOutText : optedInText
                        : optedInText

                }
                const optOut = command.value === 'out' ? true : false;
                const values: FeedOverrides[] = [];
                Object.values(feedMap).forEach(feedConf => {
                    values.push({
                        user: command.user,
                        feed: feedConf.shortname,
                        optout: optOut,
                    });
                });
                const res = await this.db.insertInto('feed_overrides')
                    .values(values)
                    .onDuplicateKeyUpdate({
                        optout: optOut
                    })
                    .executeTakeFirst();
                console.log('' + res.numInsertedOrUpdatedRows)
                return '' + res.numInsertedOrUpdatedRows === '0' ? `No changes made.`
                    : command.value === 'out' ? optedOutText
                        : command.value === 'in' ? optBackInText
                            : `Something went wrong, try again.`;
            }

            await this.executeAndReply(opt, command);

        },
        "showcommunity": async (command: BotCommand) => {
            const showcommunity = async () => {

                const community = command.value;
                const prefix: any = community?.substring(0, 1);

                if (!community || !prefix) {
                    return `I'm sorry, could not find this community.`
                }

                const communityRes = await this.db.selectFrom('community')
                    .selectAll()
                    .where('community', '=', community)
                    .executeTakeFirst();

                if (!communityRes) {
                    return `I'm sorry, could not find this community.`
                }

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

                const likes = await this.db.selectFrom('likescore')
                    .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
                    .select(({ fn, val, ref }) => [
                        sql<string>`sum(likescore.score)`.as('rank')
                    ])
                    .where('likescore.author', '=', command.user)
                    .where(prefix, '=', community)
                    .groupBy(prefix)
                    .executeTakeFirst();

                const links = await this.resolveHandles(posts.slice(0, 5).map(post => post.author));
                const likesFromYou = likes ? `
❤️Your likes: ${likes?.rank}
` : '';

                return `Type: ${communityHearts[prefix]} ${communityTypes[prefix]}

🔢Code: ${communityRes.community}
${likesFromYou}
👯Population: ${communityRes?.size}

💬Top recent posters:
${links}`;

            }

            await this.executeAndReply(showcommunity, command);

        },
        "showfeed": async (command: BotCommand) => {
            const showfeed = async () => {
                if (!command.value || !feedMap[command.value]) {
                    return `I'm sorry, no such feed exists.`
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

                    return `📍You: ${communities.userCommunity.community}

    📰${feedMap[command.value].name} ${feedMap[command.value].communityPlural}:

    🏠Home (${feedMap[command.value].config.discoverPostsRate - 1}/${feedMap[command.value].config.discoverPostsRate}): ${homeCommunities}

    🗺️Discover (1/${feedMap[command.value].config.discoverPostsRate}): ${dicoverCommunities}

    🤖💡:

    !skygraphbot showcommunity ${communities.userCommunity.community}
    `;
                }
            };

            await this.executeAndReply(showfeed, command);

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

    async executeAndReply(
        getReplyText: () => Promise<string>,
        command: { user: string, uri: string },
        embedImage?: AppBskyEmbedImages.Main
    ) {
        try {
            const replyToUrip = new AtUri(command.uri)
            const replyTo = await this.#agent.getPost({
                repo: replyToUrip.host,
                rkey: replyToUrip.rkey
            })
            const parentRef = {
                uri: replyTo.uri,
                cid: replyTo.cid
            }

            const replyText = await getReplyText();

            await this.doReply(replyText, {
                root: replyTo.value.reply?.root || parentRef,
                parent: parentRef,
                embedImage: embedImage
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

    async doReply(
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