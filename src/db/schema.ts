export type DatabaseSchema = {
  post: Post
  did_to_community: CommunityToDid
  community: Community
  likescore: LikeScore
  postrank: PostRank
  sub_state: SubState
}

export type Post = {
  uri: string
  cid: string
  replyParent: string | null
  replyRoot: string | null
  author: string
  community: string | null
  indexedAt: string
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
  o?: string
  e?: string
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
