/**
 * Publish a 140-character message to the timeline.
 * @deprecated the bird flew away — use {@link post} instead
 */
export function tweet(text: string): string {
  return text
}

export function post(text: string): string {
  return text
}

/** @deprecated nobody calls it the bird app anymore */
export const BIRD_NAME = 'Twitter'

export const APP_NAME = 'Bluesky'

/** @deprecated renamed when everyone migrated to the AT Protocol */
export interface TweetOptions {
  text: string
}

export interface PostOptions {
  text: string
}
