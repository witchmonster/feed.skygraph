export type DatabaseSchema = {
  post: Post
  did_to_community: CommunityToDid
  community: Community
  likescore: LikeScore
  postrank: PostRank
  sub_state: SubState
  feed_usage: Usage
  bot_commands: BotCommand
  feed_overrides: FeedOverrides
}

export type Post = {
  uri: string
  cid: string
  version: number
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

export type FeedOverrides = {
  user: string,
  feed: string,
  optout: boolean,
  hide_replies?: boolean,
  hide_follows?: boolean,
  c_exclude?: string[],
  c_include?: string[],
  exclude_c_by_did?: string[],
  did_exclude?: string[],
  home_communities?: number,
  discover_communities?: number,
  dicover_rate?: number,
  follows_rate?: number,
}

export type BotCommand = {
  user: string,
  command: string,
  value?: string,
  status: "created" | "processing" | "finished" | "error",
  uri: string,
  createdAt: string,
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
  version: number
  did: string
}

export type Community = {
  community: string
  version: number
  size: number
  prefix: string
}

export type SubState = {
  service: string
  cursor: number
}
