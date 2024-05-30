import { AppContext } from '../../config'

const recordUsage = async (ctx: AppContext, userDid: string, feedName: string, limit: number) => {

    const usage = await ctx.db.selectFrom('feed_usage')
        .selectAll()
        .where('feed_usage.user', '=', userDid)
        .where('feed_usage.feed', '=', feedName)
        .where('feed_usage.limit', '=', limit)
        .executeTakeFirst();

    // console.log(`result: ${usage}`);

    if (usage) {
        await ctx.db.updateTable('feed_usage')
            .set({
                refreshcount: usage.refreshcount + 1,
                lastUpdated: new Date().toISOString().substring(0, 19)
            })
            .where('feed_usage.user', '=', userDid)
            .where('feed_usage.feed', '=', feedName)
            .where('feed_usage.limit', '=', limit)
            .execute();
    } else {
        const values = {
            user: userDid,
            feed: feedName,
            limit: limit,
            refreshcount: 1,
            lastUpdated: new Date().toISOString().substring(0, 19)
        }
        // console.log({ values });
        await ctx.db.insertInto('feed_usage')
            .values(values)
            .ignore()
            .execute();
    }
}

const recordPostOutput = async (ctx: AppContext, userDid: string, feedName: string, limit: number, postOutput: number) => {
    await ctx.db.updateTable('feed_usage')
        .set({
            last_post_output: postOutput
        })
        .where('feed_usage.user', '=', userDid)
        .where('feed_usage.feed', '=', feedName)
        .where('feed_usage.limit', '=', limit)
        .execute();
}

export { recordUsage, recordPostOutput }