export type DatabaseSchema = {
  post: Post
  did_to_community: CommunityToDid
  community: Community
  // did_to_community_lp: CommunityToDid
  // did_to_community_old: CommunityToDid
  // did_to_community_current: CommunityToDid
  // community_old: Community
  // community_current: Community
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
  replyParent: string | null
  replyRoot: string | null
  author: string
  community: string | null
  indexedAt: string
  version?: string
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
  version?: string
  from_f?: string
  from_s?: string
  from_c?: string
  from_g?: string
  from_e?: string
  from_o?: string
  to_f?: string
  to_s?: string
  to_c?: string
  to_g?: string
  to_e?: string
  to_o?: string
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
