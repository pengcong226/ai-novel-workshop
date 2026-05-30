import { registerGenreProfile } from '@/types/genreProfile'
import { progressionFantasyProfile } from './progression-fantasy'
import { isekaiProfile } from './isekai'
import { cultivationProfile } from './cultivation'
import { scifiSpaceProfile } from './scifi-space'
import { romantasyProfile } from './romantasy'

/**
 * 注册所有英文题材Profile
 */
export function registerAllEnglishGenres(): void {
  registerGenreProfile(progressionFantasyProfile)
  registerGenreProfile(isekaiProfile)
  registerGenreProfile(cultivationProfile)
  registerGenreProfile(scifiSpaceProfile)
  registerGenreProfile(romantasyProfile)
}

export {
  progressionFantasyProfile,
  isekaiProfile,
  cultivationProfile,
  scifiSpaceProfile,
  romantasyProfile,
}
