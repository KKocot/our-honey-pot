// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Krzysztof Kocot

/**
 * AuthorProfile utilities - data transformation functions
 */

import type { IProfile, IDatabaseAccount, IGlobalProperties, IAccountManabars } from '@hiveio/workerbee/blog-logic'
import { calculateEffectiveHP, parseFormattedAsset } from '@hiveio/workerbee/blog-logic'
import { formatJoinDate } from '../../formatters'
import type { AuthorProfileData, AuthorProfileSettings } from './types'
import type { CardLayout, SocialLink } from '../../../components/home/types'
import { defaultAuthorProfileLayout, defaultAuthorProfileSettings } from './types'
import { hive_avatar_url } from '../../../lib/config'

/**
 * Create normalized profile data from Hive API responses
 * Used by both Astro (SSR) and SolidJS (admin canvas)
 */
export function createAuthorProfileData(
  username: string,
  profile: IProfile | null,
  account: IDatabaseAccount | null,
  globalProperties: IGlobalProperties | null,
  manabars: IAccountManabars | null
): AuthorProfileData {
  const profileMeta = profile?.metadata

  // Calculate HP
  let hivePower = 0
  if (globalProperties && account) {
    hivePower = calculateEffectiveHP(
      account.vestingShares,
      account.delegatedVestingShares,
      account.receivedVestingShares,
      globalProperties
    )
  }

  return {
    username,
    displayName: profileMeta?.name || profile?.name || username,
    about: profileMeta?.about || '',
    location: profileMeta?.location || '',
    website: profileMeta?.website || '',
    coverImage: profileMeta?.coverImage || '',
    avatarUrl: profileMeta?.profileImage || hive_avatar_url(username),
    reputation: profile?.reputation ?? 0,
    followers: profile?.stats?.followers ?? 0,
    following: profile?.stats?.following ?? 0,
    postCount: account?.postCount ?? profile?.postCount ?? 0,
    joinDate: profile?.created ? formatJoinDate(profile.created) : 'Unknown',
    hivePower,
    votingPower: manabars?.upvote?.percent ?? 0,
    hiveBalance: account ? parseFormattedAsset(account.balance) : 0,
    hbdBalance: account ? parseFormattedAsset(account.hbdBalance) : 0,
  }
}

export const AUTHOR_PROFILE_SIZE_KEYS = [
  'authorAvatarSizePx',
  'authorCoverHeightPx',
  'authorUsernameSizePx',
  'authorDisplayNameSizePx',
  'authorAboutSizePx',
  'authorStatsSizePx',
  'authorMetaSizePx',
  'authorReputationSizePx',
] as const

export type AuthorProfileSizeKey = (typeof AUTHOR_PROFILE_SIZE_KEYS)[number]
export type AuthorProfileSizes = Partial<Record<AuthorProfileSizeKey, number>>

/** Size settings of one author profile instance; pass instance-resolved settings so overrides and global values both apply. */
export function pickAuthorProfileSizes(settings: AuthorProfileSizes): AuthorProfileSizes {
  const sizes: AuthorProfileSizes = {}
  for (const key of AUTHOR_PROFILE_SIZE_KEYS) {
    const value = settings[key]
    if (typeof value === 'number') sizes[key] = value
  }
  return sizes
}

/**
 * Create profile settings from partial settings object
 */
export function createAuthorProfileSettings(
  settings: AuthorProfileSizes & {
    authorProfileLayout2?: CardLayout
    socialLinks?: SocialLink[]
  }
): AuthorProfileSettings {
  return {
    layout: settings.authorProfileLayout2 ?? defaultAuthorProfileLayout,
    avatarSize: settings.authorAvatarSizePx ?? defaultAuthorProfileSettings.avatarSize,
    coverHeight: settings.authorCoverHeightPx ?? defaultAuthorProfileSettings.coverHeight,
    usernameSize: settings.authorUsernameSizePx ?? defaultAuthorProfileSettings.usernameSize,
    displayNameSize: settings.authorDisplayNameSizePx ?? defaultAuthorProfileSettings.displayNameSize,
    aboutSize: settings.authorAboutSizePx ?? defaultAuthorProfileSettings.aboutSize,
    statsSize: settings.authorStatsSizePx ?? defaultAuthorProfileSettings.statsSize,
    metaSize: settings.authorMetaSizePx ?? defaultAuthorProfileSettings.metaSize,
    reputationSize: settings.authorReputationSizePx ?? defaultAuthorProfileSettings.reputationSize,
    socialLinks: settings.socialLinks ?? [],
  }
}
