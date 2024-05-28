export type DatabaseSchema = {
  post: Post
  did_to_community: CommunityToDid
  community: Community
  likescore: LikeScore
  postrank: PostRank
  sub_state: SubState,
  feed_usage: Usage
}

export type Post = {
  uri: string
  cid: string
  replyParent: string | null
  replyRoot: string | null
  author: string
  community: string | null
  indexedAt: string
  f?: string
  s?: string
  c?: string
  g?: string
  e?: string
  o?: string
}

export type Usage = {
  user: string,
  feed: string,
  limit: number,
  refreshcount: number,
  lastUpdated: string,
  last_post_output?: number,
}

export type LikeScore = {
  author: string
  subject: string
  score: number
}
export type PostRank = {
  uri: string
  score: number
}

export type CommunityToDid = {
  f?: string
  s?: string
  c?: string
  g?: string
  e?: string
  o?: string
  did: string
}

export type Community = {
  community: string
  size: number
  prefix: string
}

export type SubState = {
  service: string
  cursor: number
}
