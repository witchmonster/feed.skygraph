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

function rateLimit(array: PostResult[]): PostResult[] {
    const newArray: Map<string, PostResult> = new Map();
    for (var i = 0; i < array.length; i++) {
        if (newArray.get(array[i].author)) {
            //random chance to overwrite the post with a different one
            // to give each post a chance every refresh
            if (Math.random() >= 0.8) {
                newArray.set(array[i].author, array[i]);
            }
        } else {
            newArray.set(array[i].author, array[i]);
        }
    }
    return Array.from(newArray.values());
}

export { shuffleArray, rateLimit }
