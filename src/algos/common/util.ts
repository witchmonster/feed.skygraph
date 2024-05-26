interface PostResult {
    author: string,
    uri: string,
    indexedAt: string;
    rank?: string;
}

function shuffleArray(array: any) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function rateLimit(array: PostResult[] | undefined, randomize?: boolean): PostResult[] {
    if (!array) {
        return [];
    }
    const newArray: Map<string, PostResult> = new Map();
    for (var i = 0; i < array.length; i++) {
        if (newArray.get(array[i].author)) {
            //random chance to overwrite the post with a different one
            // to give each post a chance every refresh
            if (randomize && Math.random() >= 0.8) {
                newArray.set(array[i].author, array[i]);
            }
        } else {
            newArray.set(array[i].author, array[i]);
        }
    }
    return [...newArray.values()];
}

function shuffleRateLimitTrim(res: PostResult[], limit: number) {
    shuffleArray(res);

    console.log(`total posts: ${res.length}`);

    try {
        const rateLimitedRes = rateLimit(res, true);
        console.log(`rate limited to: ${rateLimitedRes.length}`);
        return rateLimitedRes.slice(0, limit);
    } catch (err) {
        console.log(`rate limit failed: ${err}`);
        return res.slice(0, limit);
    }

}

const mergePosts = async (seed: number, rate: number, originalPosts: { author: string, uri: string }[] | undefined, postsToMixIn: { author: string, uri: string }[] | undefined) => {
    if (!originalPosts || !postsToMixIn) {
        return [];
    }
    let i = 0;
    let j = 0;
    //never replace last post since it's used in ranking
    const mixedInPosts: { author: string, uri: string }[] = [];
    while (i < originalPosts.length && j < postsToMixIn.length) {
        if (originalPosts[i].author === postsToMixIn[j].author) {
            mixedInPosts.push(originalPosts[j]);
            // console.log(`${mixedInPosts.length}=>original ${originalPosts[i].uri}`)
            i++;
        } else {
            if (mixedInPosts.length % rate === seed % rate) {
                mixedInPosts.push(postsToMixIn[j]);
                // console.log(`${mixedInPosts.length}=>mixed in at [${j}]:${postsToMixIn[j].uri}`)
                j++;
            } else {
                mixedInPosts.push(originalPosts[i]);
                // console.log(`${mixedInPosts.length}=>original ${originalPosts[i].uri}`)
                i++;
            }
        }
    }
    return mixedInPosts;
}

export { shuffleArray, rateLimit, shuffleRateLimitTrim, mergePosts }
