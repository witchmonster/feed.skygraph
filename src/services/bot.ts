import type {
    AtpAgentLoginOpts,
    AtpAgentOpts,
    AppBskyFeedPost,
    AppBskyEmbedImages,
} from "@atproto/api";
import { AtUri, BskyAgent, RichText } from "@atproto/api";
import { createDb, Database, migrateToLatest } from '../db'
import { CronJob } from 'cron';
import { BotCommand, Community, FeedOverrides } from "../db/schema";
import { ReplyRef } from "../lexicon/types/app/bsky/feed/post";
import { sql } from "kysely";
import { DidResolver, MemoryCache } from "@atproto/identity";
import { getUserCommunities, sliceCommunityResponse } from "../algos/common/communities";
import { config as mygalaxyPlusConfig } from "../algos/feeds/mygalaxyplus";
import { config as myNebulaPlusConfig } from "../algos/feeds/mynebulaplus";
import { InvalidRequestError } from "@atproto/xrpc-server";
import dotenv from 'dotenv';
import { MyCommunityPlusTemplateConfig } from "../algos/templates/mycommunityplus";
import { measureMemory } from "vm";

dotenv.config();

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

const feedMap: {
    [key: string]: {
        key: string,
        config: MyCommunityPlusTemplateConfig,
        name: string,
        shortname: string,
        communityNoun: string,
        communityPlural: string
    }
} = {
    "mygalaxy+": {
        key: "mygalaxy+",
        config: mygalaxyPlusConfig,
        name: mygalaxyPlusConfig.feedName,
        shortname: mygalaxyPlusConfig.shortName,
        communityNoun: "Nebula",
        communityPlural: "Nebulas"
    },
    "mynebula+": {
        key: "mynebula+",
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

    static keyword: string = process.env.BSKY_BOT_KEYWORD || "!skygraphtest";

    static commands = ['whereami', 'showcommunity', 'showfeed', 'opt', 'repliesoff', 'replieson', 'status', 'help', 'followsoff', 'followson', 'setoption', 'find'];

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

${Bot.keyword} showcommunity ${communities.o}

${Bot.keyword} help`;
                }
            }

            await this.executeAndReply(whereami, command);

        },
        "opt": async (command: BotCommand) => {
            const optedOutText = `You are opted out of SkyGraph feeds.

Your content won't be shown in feeds and you won't be shown personalized content.

To opt out of SkyGraph dataset and map: @optout.skygraph.art

To opt back in:

${Bot.keyword} opt in`;

            const optedInText = `You are opted in to SkyGraph feeds.

Both feeds are showing you personalized content based on your likes and prior interactions.

To opt out:

${Bot.keyword} opt out`;
            const optBackInText = `Welcome back! You've been opted back in to SkyGraph My Nebula+/My Galaxy+ feeds.`;
            if (command.value !== 'in' && command.value !== 'out' && command.value !== 'status') {
                return `I'm sorry, this is not a valid command. Please use 'opt status', 'opt in' or 'opt out'.`
            }
            const opt = async () => {
                const current = await this.db.selectFrom('feed_overrides')
                    .selectAll()
                    .where('user', '=', command.user)
                    .executeTakeFirst();

                if (!current) {
                    return optedInText;
                }
                if (current && current.optout && command.value === 'out') {
                    return optedOutText;
                }
                if (current && !current.optout && command.value === 'in') {
                    return optedInText;
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
                // console.log('' + res.numInsertedOrUpdatedRows)
                return '' + res.numInsertedOrUpdatedRows === '0' ? `No changes made.`
                    : command.value === 'out' ? optedOutText
                        : command.value === 'in' ? optBackInText
                            : `Something went wrong, try again.`;
            }

            await this.executeAndReply(opt, command);

        },
        "repliesoff": async (command: BotCommand) => {
            await this.executeAndReply(this.repliesonoff("off", command), command);
        },
        "replieson": async (command: BotCommand) => {
            await this.executeAndReply(this.repliesonoff("on", command), command);
        },
        "followsoff": async (command: BotCommand) => {
            await this.executeAndReply(this.followsonoff("off", command), command);
        },
        "followson": async (command: BotCommand) => {
            await this.executeAndReply(this.followsonoff("on", command), command);
        },
        "setoption": async (command: BotCommand) => {
            const setoption = async () => {
                const invalidCommand = `Invalid command or value.

🤖💡:
${Bot.keyword} help

${Bot.keyword} help examples`
                if (!command.value) {
                    return invalidCommand;
                }
                const split = command.value.split("::")
                if (!split || split.length < 2) {
                    return invalidCommand;
                }
                if (!feedMap[split[0]]) {
                    return invalidCommand;
                }
                const feed = feedMap[split[0]].shortname;
                const splitValue = split[1].split("=");
                if (!splitValue || splitValue.length < 2) {
                    return invalidCommand;
                }
                const option = splitValue[0];
                let optionValue;
                optionValue = (option === 'c_include'
                    || option === 'c_exclude') ? splitValue[1] : +splitValue[1];

                if (!optionValue || (option === 'home_communities'
                    || option === 'discover_communities'
                    || option === 'discover_rate'
                    || option === 'follows_rate') && +optionValue < 1) {
                    return invalidCommand
                }

                if (option === 'home_communities'
                    || option === 'discover_communities'
                    || option === 'discover_rate'
                    || option === 'follows_rate'
                    || option === 'c_include'
                    || option === 'c_exclude'
                ) {
                    const values = {
                        user: command.user,
                        feed: feed,
                        optout: false
                    };
                    values[option] = optionValue;
                    const update = {};
                    update[option] = optionValue;

                    try {
                        await this.db.insertInto('feed_overrides')
                            .values(values)
                            .onDuplicateKeyUpdate(update)
                            .executeTakeFirst();
                    } catch (err) {
                        return invalidCommand;
                    }
                    // console.log({ res });

                    return await this.getOverrideStatusReply({ ...command, value: feedMap[split[0]].key });
                } else {
                    return invalidCommand;
                }
            }
            await this.executeAndReply(setoption, command);
        },
        "help": async (command: BotCommand) => {
            const help = async () => {
                if (command.value && command.value === 'examples') {
                    return `🤖💡:

${Bot.keyword} whereami
${Bot.keyword} opt out
${Bot.keyword} status mygalaxy+
${Bot.keyword} showfeed mynebula+
${Bot.keyword} showcommunity o2025039
${Bot.keyword} find o::skygraph.art
${Bot.keyword} followsoff mynebula+
${Bot.keyword} repliesoff mygalaxy+
${Bot.keyword} setoption mygalaxy+::follows_rate=10`
                } else if (command.value && command.value === 'options') {
                    return `🤖💡:

f: [ mygalaxy+, mynebula+ ]
p: [ f, s, c, g, e, o ]
u: [ user_hanle, post_url ]

opt:

home_communities: number,
discover_communities: number,
follows_rate: number,
discover_rate: number,
c_exclude: string[],
c_include: string[]`;
                } else {
                    return `🤖💡:

${Bot.keyword} whereami
${Bot.keyword} opt out
${Bot.keyword} status [f]
${Bot.keyword} showfeed [f]
${Bot.keyword} showcommunity [c]
${Bot.keyword} find [p]::[u]
${Bot.keyword} followsoff [f]
${Bot.keyword} repliesoff [f]
${Bot.keyword} setoption [f::opt=v]
${Bot.keyword} help examples
${Bot.keyword} help options`;
                }
            }
            await this.executeAndReply(help, command);
        },
        "status": async (command: BotCommand) => {
            const status = () => this.getOverrideStatusReply(command);
            await this.executeAndReply(status, command);
        },
        "find": async (command: BotCommand) => {
            const showcommunity = async () => {

                const sorry = `I'm sorry, I could not find this community.`;

                if (!command.value) {
                    return sorry;
                }

                const split = command.value.split("::");

                if (!split || split.length < 2) {
                    return sorry;
                }

                const prefix: any = split[0];

                if (!prefix || ['f', 's', 'c', 'g', 'e', 'o'].indexOf(prefix) === -1) {
                    return sorry;
                }

                let communityRes: Community | undefined;
                let maybeDid: string | undefined;
                let maybeProfile;
                if (split[1].startsWith('https://')) {
                    const urlSplit = split[1].split('/');
                    if (!urlSplit || urlSplit.length < 5) {
                        return sorry;
                    }
                    maybeProfile = await this.#agent.getProfile({ actor: urlSplit[4] });
                } else {
                    maybeProfile = await this.#agent.getProfile({ actor: split[1] });
                }

                maybeDid = maybeProfile && maybeProfile.success && maybeProfile.data.did ? maybeProfile.data.did : undefined;

                const didToPrefix: any = `did_to_community.${prefix}`
                if (maybeDid) {
                    communityRes = await this.db.selectFrom('did_to_community')
                        .innerJoin('community', 'community.community', didToPrefix)
                        .select(['community.community', 'community.size', 'community.prefix'])
                        .where('did_to_community.did', '=', maybeDid)
                        .executeTakeFirst();
                } else {
                    return sorry;
                }

                if (!communityRes) {
                    return sorry;
                }

                return this.showCommunity(command.user, communityRes);
            }

            await this.executeAndReply(showcommunity, command);

        },
        "showcommunity": async (command: BotCommand) => {
            const showcommunity = async () => {

                const sorry = `I'm sorry, I could not find this community.`;
                const community = command.value;
                const prefix: any = community?.substring(0, 1);

                if (!community || !prefix) {
                    return sorry;
                }

                const communityRes = await this.db.selectFrom('community')
                    .selectAll()
                    .where('community', '=', community)
                    .executeTakeFirst();

                if (!communityRes) {
                    return `I'm sorry, could not find this community.`
                }

                return this.showCommunity(command.user, communityRes);
            }

            await this.executeAndReply(showcommunity, command);

        },
        "showfeed": async (command: BotCommand) => {
            const showfeed = async () => {
                if (!command.value || !feedMap[command.value]) {
                    return `I'm sorry, no such feed exists.`
                } else {
                    const communities = await getUserCommunities(this.db, [], command.user, {
                        mode: feedMap[command.value].config.mode,
                        homeCommunities: feedMap[command.value].config.homeCommunities,
                        discoverCommunities: feedMap[command.value].config.discoverCommunities,
                        trustedFriendsLimit: feedMap[command.value].config.trustedFriendsLimit,
                        feed: feedMap[command.value].config.feedKey
                    });

                    const homeCommunitiesCount = feedMap[command.value].config.homeCommunities ?? communities.feedOverrides?.home_communities;
                    const discoverCommunitiesCount = feedMap[command.value].config.discoverCommunities ?? communities.feedOverrides?.discover_communities;
                    const totalCommunities = homeCommunitiesCount + discoverCommunitiesCount;

                    const homeSlice = sliceCommunityResponse(communities, homeCommunitiesCount);
                    const discoverSlice = sliceCommunityResponse(communities, totalCommunities, homeCommunitiesCount);
                    const totalResultingCommunities = communities.topCommunitiesByLikes.communities.length + communities.exploreCommunitiesByLikes.communities.length;
                    const notEnoughCommunities = totalResultingCommunities < feedMap[command.value].config.homeCommunities + feedMap[command.value].config.discoverCommunities;
                    const homeCommunities = [communities.userCommunity.community, ...communities.includeCommunities.communities ?? [], ...homeSlice.topCommunitiesByLikes.communities, ...homeSlice.exploreCommunitiesByLikes.communities]
                    const dicoverCommunities: string[] = [];
                    const discoverPostsRate = communities.feedOverrides?.dicover_rate ?? feedMap[command.value].config.discoverPostsRate;
                    if (notEnoughCommunities) {
                        dicoverCommunities.push(communities.exploreCommunity.community);
                    }
                    dicoverCommunities.push(...discoverSlice.topCommunitiesByLikes.communities, ...discoverSlice.exploreCommunitiesByLikes.communities);

                    return `📰${feedMap[command.value].name} ${feedMap[command.value].communityPlural}:

🏠Home (${discoverPostsRate - 1}/${discoverPostsRate}): ${homeCommunities.slice(0, 10)}

🗺️Discover (1/${discoverPostsRate}): ${dicoverCommunities.slice(0, 10)}

🤖💡:

${Bot.keyword} showcommunity ${communities.userCommunity.community}

${Bot.keyword} help`;
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

    async showCommunity(user: string, communityRes: Community) {
        const prefix: any = communityRes.community.substring(0, 1);
        const posts = await this.db.selectFrom('post')
            .innerJoin('postrank', 'post.uri', 'postrank.uri')
            .select(({ fn, val, ref }) => [
                'post.author', 'post.uri',
                sql<string>`sum((postrank.score-1)/power(timestampdiff(second,post.indexedAt,now())/3600 + 2,2))`.as('rank')
            ])
            .where(prefix, '=', communityRes.community)
            .limit(5)
            .groupBy('post.author')
            .orderBy('rank', 'desc')
            .execute();

        const likes = await this.db.selectFrom('likescore')
            .innerJoin('did_to_community', 'likescore.subject', 'did_to_community.did')
            .select(({ fn, val, ref }) => [
                sql<string>`sum(likescore.score)`.as('rank')
            ])
            .where('likescore.author', '=', user)
            .where(prefix, '=', communityRes.community)
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

    async getOverrideStatus(command: BotCommand) {
        const feed = command.value;
        let feedConf;
        let statusQuery = this.db.selectFrom('feed_overrides')
            .selectAll()
            .where('user', '=', command.user);
        if (feed && feedMap[feed]) {
            feedConf = feedMap[feed];
            statusQuery = statusQuery
                .where('feed', '=', feedConf.shortname)
        }

        const options: FeedOverrides | undefined = await statusQuery.executeTakeFirst();

        return { feedConf, options };
    }

    async getOverrideStatusReply(command: BotCommand) {
        {
            const status: { feedConf: any, options: FeedOverrides | undefined } = await this.getOverrideStatus(command);
            if (!status.feedConf) {
                return `You are opted ${status.options?.optout ? "out of" : "in to"} SkyGraph feeds.

To opt ${status.options?.optout ? "in" : "out"}

${Bot.keyword} opt ${status.options?.optout ? "in" : "out"}

🤖💡:

${Bot.keyword} help`;
            }
            const { feedConf, options } = status;

            return `Your settings for ${feedConf.name}

Opt out: ${options?.optout ? 'Yes' : 'No'}
Replies: ${options?.hide_replies ? 'Hidden' : 'Showing'}
Follows: ${options?.hide_follows ? 'Hidden' : 'Showing'}
Follows rate: ${options?.follows_rate ?? feedConf.config.followsPostsRate}
Home communities: ${options?.home_communities ?? feedConf.config.homeCommunities}
Discover rate: ${options?.dicover_rate ?? feedConf.config.discoverPostsRate}
Discover communities: ${options?.discover_communities ?? feedConf.config.discoverCommunities}
Included communities: ${options?.c_include?.slice(0, 5) ?? []}
Excluded communities: ${options?.c_exclude?.slice(0, 5) ?? []}

🤖💡:

${Bot.keyword} help`;

        }
    }

    repliesonoff(onoff: string, command: BotCommand) {
        return async () => {
            const status = await this.getOverrideStatus(command);
            if (!status.feedConf) {
                return `Feed does not exist.`;
            }

            const { feedConf, options } = status;

            const turnOff = async (toggle: boolean) => {
                await this.db.insertInto('feed_overrides')
                    .values({
                        user: command.user,
                        feed: feedConf.shortname,
                        optout: false,
                        hide_replies: toggle
                    })
                    .onDuplicateKeyUpdate({
                        hide_replies: toggle
                    })
                    .execute();
            }
            const antionoff = onoff === 'off' ? 'on' : 'off';
            const undoUsage = `
undo:

${Bot.keyword} replies${antionoff} ${feedConf.key}

🤖💡:

${Bot.keyword} status ${feedConf.key}

${Bot.keyword} help`;
            if (options?.hide_replies) {
                if (onoff === 'on') {
                    await turnOff(false)
                    return `You turned replies on for ${feedConf.name}.${undoUsage}`;
                }

                if (onoff === 'off') {
                    return `Replies are already off for ${feedConf.name}.`;
                }
            } else {
                if (onoff === 'on') {
                    return `Replies are already on for ${feedConf.name}.`;
                }

                if (onoff === 'off') {
                    await turnOff(true)
                    return `You turned replies off for ${feedConf.name}.${undoUsage}`;
                }
            }

            return 'Something went wrong.';
        }
    }

    followsonoff(onoff: string, command: BotCommand) {
        return async () => {
            const status = await this.getOverrideStatus(command);
            if (!status.feedConf) {
                return `Feed does not exist.`;
            }

            const { feedConf, options } = status;

            const turnOff = async (toggle: boolean) => {
                await this.db.insertInto('feed_overrides')
                    .values({
                        user: command.user,
                        feed: feedConf.shortname,
                        optout: false,
                        hide_follows: toggle
                    })
                    .onDuplicateKeyUpdate({
                        hide_follows: toggle
                    })
                    .execute();
            }
            const antionoff = onoff === 'off' ? 'on' : 'off';
            const undoUsage = `
undo:

${Bot.keyword} follows${antionoff} ${feedConf.key}

🤖💡:

${Bot.keyword} status ${feedConf.key}

${Bot.keyword} help`;
            if (options?.hide_follows) {
                if (onoff === 'on') {
                    await turnOff(false)
                    return `You turned follows on for ${feedConf.name}.${undoUsage}`;
                }

                if (onoff === 'off') {
                    return `Follows are already off for ${feedConf.name}.`;
                }
            } else {
                if (onoff === 'on') {
                    return `Follows are already on for ${feedConf.name}.`;
                }

                if (onoff === 'off') {
                    await turnOff(true)
                    return `You turned follows off for ${feedConf.name}.${undoUsage}`;
                }
            }

            return 'Something went wrong.';
        }
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