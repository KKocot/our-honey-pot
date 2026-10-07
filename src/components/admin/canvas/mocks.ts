// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

import type { BridgePost, IDatabaseAccount, IGlobalProperties, IProfile } from '@hiveio/workerbee/blog-logic'
import type { HiveCommunity } from '../../../lib/types/community'
import type { CommunityPreviewData, HiveData } from '../queries'

export type CanvasKind = 'user' | 'community'

/** Data the canvas hands to SectionRenderer: `hive` in user mode, `community` in community mode. */
export interface CanvasData {
  hive: HiveData | null
  community: CommunityPreviewData | null
}

export const MOCK_USERNAME = 'sample-author'
export const MOCK_COMMUNITY_NAME = 'hive-100000'

const MOCK_IMAGE = 'https://images.hive.blog/u/hiveio/avatar/large'

function deep_freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deep_freeze(nested)
  }
  return value
}

interface SamplePostSeed {
  title: string
  summary: string
  created: string
  votes: number
  comments: number
  payout: number
  tags: string[]
}

const SAMPLE_POST_SEEDS: readonly SamplePostSeed[] = deep_freeze([
  {
    title: 'Introduction to Hive Blockchain',
    summary:
      'Hive is a decentralized social media platform built on blockchain technology. In this article you will learn how it works and what its advantages are.',
    created: '2026-01-13T10:00:00',
    votes: 156,
    comments: 24,
    payout: 12.45,
    tags: ['hive', 'blockchain', 'crypto', 'introduction', 'guide'],
  },
  {
    title: 'How to Earn on Hive?',
    summary:
      'A complete guide to earning opportunities on the Hive platform - from content creation to curation and staking.',
    created: '2026-01-12T10:00:00',
    votes: 89,
    comments: 15,
    payout: 8.32,
    tags: ['earnings', 'hive', 'tutorial'],
  },
  {
    title: 'News from the Hive Ecosystem',
    summary:
      'An overview of the latest apps and projects being built on the Hive blockchain. See what new developments are emerging in the community.',
    created: '2026-01-11T10:00:00',
    votes: 234,
    comments: 42,
    payout: 25.1,
    tags: ['hive', 'dapps', 'news', 'community'],
  },
  {
    title: 'Comparing Hive with Other Blockchains',
    summary:
      'A technical analysis comparing Hive with Ethereum, Solana and other popular platforms. Check the differences in performance.',
    created: '2026-01-10T10:00:00',
    votes: 178,
    comments: 31,
    payout: 18.75,
    tags: ['hive', 'ethereum', 'comparison', 'tech'],
  },
])

const COMMUNITY_AUTHORS: readonly string[] = deep_freeze(['hivebuzz', 'blocktrades', 'peakd', 'theycallmedan'])

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function base_post(author: string, permlink: string, created: string): BridgePost {
  return {
    post_id: 0,
    author,
    permlink,
    category: 'hive',
    title: '',
    body: '',
    created,
    updated: created,
    depth: 0,
    children: 0,
    net_rshares: 0,
    is_paidout: false,
    payout_at: created,
    replies: [],
    reblogs: 0,
    url: `/@${author}/${permlink}`,
    beneficiaries: [],
    max_accepted_payout: '1000000.000 HBD',
    percent_hbd: 10000,
    json_metadata: {},
    stats: { hide: false, gray: false, total_votes: 0, flag_weight: 0 },
    payout: 0,
    author_reputation: 65,
    active_votes: [],
    blacklists: [],
  }
}

function seed_to_post(seed: SamplePostSeed, index: number, author: string, community?: string): BridgePost {
  const permlink = slugify(seed.title)
  return {
    ...base_post(author, permlink, seed.created),
    post_id: index + 1,
    category: community ?? seed.tags[0] ?? 'hive',
    title: seed.title,
    body: seed.summary,
    children: seed.comments,
    json_metadata: { tags: [...seed.tags], image: [MOCK_IMAGE] },
    stats: { hide: false, gray: false, total_votes: seed.votes, flag_weight: 0 },
    payout: seed.payout,
    active_votes: Array.from({ length: seed.votes }, (_, i) => ({ voter: `voter-${i + 1}`, rshares: 1_000_000 })),
    ...(community ? { community, community_title: 'Sample Community' } : {}),
  }
}

const USER_POSTS_TEMPLATE: readonly BridgePost[] = deep_freeze(
  SAMPLE_POST_SEEDS.map((seed, index) => seed_to_post(seed, index, MOCK_USERNAME))
)

const COMMUNITY_POSTS_TEMPLATE: readonly BridgePost[] = deep_freeze(
  SAMPLE_POST_SEEDS.map((seed, index) =>
    seed_to_post(seed, index, COMMUNITY_AUTHORS[index % COMMUNITY_AUTHORS.length] ?? MOCK_USERNAME, MOCK_COMMUNITY_NAME)
  )
)

const COMMENTS_TEMPLATE: readonly BridgePost[] = deep_freeze([
  {
    ...base_post(MOCK_USERNAME, 're-hivebuzz-sample-1', '2026-01-13T12:30:00'),
    post_id: 101,
    depth: 1,
    body: 'Great overview! The section about resource credits finally made it click for me.',
    parent_author: 'hivebuzz',
    parent_permlink: 'introduction-to-hive-blockchain',
    active_votes: [{ voter: 'hivebuzz', rshares: 1_000_000 }],
  },
  {
    ...base_post(MOCK_USERNAME, 're-peakd-sample-2', '2026-01-11T18:05:00'),
    post_id: 102,
    depth: 1,
    body: 'Looking forward to trying the new apps mentioned here.',
    parent_author: 'peakd',
    parent_permlink: 'news-from-the-hive-ecosystem',
  },
])

const THREADS_TEMPLATE: readonly BridgePost[] = deep_freeze([
  {
    ...base_post(MOCK_USERNAME, 're-my-threads-sample-1', '2026-01-14T09:00:00'),
    post_id: 201,
    depth: 1,
    body: 'Short thought of the day: consistency beats intensity.',
    parent_author: MOCK_USERNAME,
    parent_permlink: 'my-threads',
  },
  {
    ...base_post(MOCK_USERNAME, 're-my-threads-sample-2', '2026-01-12T16:20:00'),
    post_id: 202,
    depth: 1,
    body: 'Working on a longer post about curation strategies. Stay tuned!',
    parent_author: MOCK_USERNAME,
    parent_permlink: 'my-threads',
  },
])

const PROFILE_TEMPLATE: IProfile = deep_freeze({
  name: MOCK_USERNAME,
  created: '2020-01-15T10:00:00',
  postCount: 89,
  reputation: 72,
  stats: { followers: 1234, following: 567, rank: 0 },
  metadata: {
    name: 'Sample User',
    about: 'This is a sample bio for preview purposes. Your real bio will appear here.',
    location: 'Earth',
    website: 'https://hive.blog',
    profileImage: MOCK_IMAGE,
    coverImage: '',
  },
})

const DB_ACCOUNT_TEMPLATE: IDatabaseAccount = deep_freeze({
  name: MOCK_USERNAME,
  balance: '123.456 HIVE',
  hbdBalance: '78.901 HBD',
  vestingShares: { amount: '9000000000000', precision: 6, nai: '@@000000037' },
  delegatedVestingShares: { amount: '0', precision: 6, nai: '@@000000037' },
  receivedVestingShares: { amount: '0', precision: 6, nai: '@@000000037' },
  postCount: 89,
  curationRewards: 1200,
  postingRewards: 3400,
})

// Ratio of roughly 600 VESTS per HIVE, so the profile shows a plausible Hive Power.
const GLOBAL_PROPS_TEMPLATE: IGlobalProperties = deep_freeze({
  totalVestingFundHive: { amount: '150000000000', precision: 3, nai: '@@000000021' },
  totalVestingShares: { amount: '90000000000000000', precision: 6, nai: '@@000000037' },
})

const COMMUNITY_TEMPLATE: HiveCommunity = deep_freeze({
  id: 100000,
  name: MOCK_COMMUNITY_NAME,
  title: 'Sample Community',
  about: 'A sample community shown until your blog has its own data.',
  description: 'This description is sample content. Your community description from Hive will appear here.',
  flag_text: 'Be kind. No spam, no plagiarism.\nTag posts with relevant topics.',
  avatar_url: MOCK_IMAGE,
  context: {},
  created_at: '2020-01-15T10:00:00',
  is_nsfw: false,
  lang: 'en',
  num_authors: 42,
  num_pending: 12,
  settings: {},
  subscribers: 1280,
  sum_pending: 156,
  team: [
    [MOCK_COMMUNITY_NAME, 'owner', ''],
    ['hivebuzz', 'admin', 'Founder'],
    ['peakd', 'mod', 'Moderator'],
  ],
  type_id: 1,
})

function with_author(posts: readonly BridgePost[], author: string): BridgePost[] {
  return posts.map((post) => ({ ...post, author, url: `/@${author}/${post.permlink}` }))
}

/** Fresh sample blog posts; `author` replaces the placeholder account name. */
export function create_mock_posts(author: string = MOCK_USERNAME): BridgePost[] {
  return with_author(structuredClone(USER_POSTS_TEMPLATE) as BridgePost[], author)
}

export function create_mock_comments(author: string = MOCK_USERNAME): BridgePost[] {
  return with_author(structuredClone(COMMENTS_TEMPLATE) as BridgePost[], author)
}

export function create_mock_threads(author: string = MOCK_USERNAME): BridgePost[] {
  return with_author(structuredClone(THREADS_TEMPLATE) as BridgePost[], author).map((post) => ({
    ...post,
    parent_author: author,
  }))
}

export function create_mock_profile(name: string = MOCK_USERNAME): IProfile {
  return { ...structuredClone(PROFILE_TEMPLATE), name }
}

export function create_mock_hive_data(username: string = MOCK_USERNAME): HiveData {
  return {
    profile: create_mock_profile(username),
    dbAccount: { ...structuredClone(DB_ACCOUNT_TEMPLATE), name: username },
    globalProps: structuredClone(GLOBAL_PROPS_TEMPLATE),
    posts: create_mock_posts(username),
    comments: create_mock_comments(username),
    threads: create_mock_threads(username),
  }
}

export function create_mock_community(name: string = MOCK_COMMUNITY_NAME): HiveCommunity {
  const community = structuredClone(COMMUNITY_TEMPLATE)
  return {
    ...community,
    name,
    team: community.team.map((member) => (member[1] === 'owner' ? [name, ...member.slice(1)] : member)),
  }
}

export function create_mock_community_posts(name: string = MOCK_COMMUNITY_NAME): BridgePost[] {
  return (structuredClone(COMMUNITY_POSTS_TEMPLATE) as BridgePost[]).map((post) => ({
    ...post,
    category: name,
    community: name,
  }))
}

export function create_mock_community_preview(name: string = MOCK_COMMUNITY_NAME): CommunityPreviewData {
  return { community: create_mock_community(name), posts: create_mock_community_posts(name) }
}

/** Sample data for the given blog kind; `account` personalises names so the canvas reads like the user's blog. */
export function create_mock_canvas_data(kind: CanvasKind, account?: string): CanvasData {
  const name = account?.trim()
  if (kind === 'community') {
    return { hive: null, community: create_mock_community_preview(name || MOCK_COMMUNITY_NAME) }
  }
  return { hive: create_mock_hive_data(name || MOCK_USERNAME), community: null }
}
