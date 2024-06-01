import Bot, { BotOptions } from "../services/bot";
import dotenv from 'dotenv'
import { InvalidRequestError } from "@atproto/xrpc-server";

const run = async (
    botOptions?: Partial<BotOptions>
) => {
    dotenv.config();

    const BSKY_HANDLE = process.env.BSKY_BOT_USER;
    const BSKY_PASSWORD = process.env.BSKY_BOT_PASSWORD;
    console.log({ env: BSKY_HANDLE })
    if (BSKY_HANDLE && BSKY_PASSWORD) {
        const { service, dryRun } = botOptions
            ? Object.assign({}, Bot.defaultOptions, botOptions)
            : Bot.defaultOptions;
        const bot = new Bot(service);
        await bot.login({
            identifier: BSKY_HANDLE,
            password: BSKY_PASSWORD,
        });
        if (!dryRun) {
            await bot.start();
        }
    } else {
        throw new InvalidRequestError("No bot credentials provided");
    }
}

run({ dryRun: false });

console.log(`[${new Date().toISOString()}] Bot started...`);