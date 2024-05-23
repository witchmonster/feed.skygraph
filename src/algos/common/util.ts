interface PostResult {
    author: string, uri: string
}

function shuffleArray(array: any) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function rateLimit(array: PostResult[], maxPosts: number): PostResult[] {
    const newArray: Map<string, PostResult> = new Map();
    const rate: Map<string, number> = new Map();
    for (var i = 0; i < array.length; i++) {
        const authorsRate = rate.get(array[i].author);
        if (newArray.get(array[i].author) && authorsRate && authorsRate >= maxPosts) {
            //do nothing
        } else {
            newArray.set(array[i].author, array[i]);
            rate.set(array[i].author, (authorsRate ?? 0) + 1)
        }
    }
    return Array.from(newArray.values());
}

export { shuffleArray, rateLimit }
