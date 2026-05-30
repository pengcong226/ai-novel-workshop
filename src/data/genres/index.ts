import { registerGenreProfile } from '@/types/genreProfile'
import { xuanhuanProfile } from './xuanhuan'
import { xianxiaProfile } from './xianxia'
import { urbanProfile } from './urban'
import { historyProfile } from './history'
import { mysteryProfile } from './mystery'
import { scifiProfile } from './scifi'
import { wuxiaProfile } from './wuxia'
import { romanceProfile } from './romance'
import { gameProfile } from './game'
import { lightnovelProfile } from './lightnovel'
import { registerAllEnglishGenres } from './en'

/**
 * 注册所有预定义的题材Profile
 */
export function registerAllGenres(): void {
  registerGenreProfile(xuanhuanProfile)
  registerGenreProfile(xianxiaProfile)
  registerGenreProfile(urbanProfile)
  registerGenreProfile(historyProfile)
  registerGenreProfile(mysteryProfile)
  registerGenreProfile(scifiProfile)
  registerGenreProfile(wuxiaProfile)
  registerGenreProfile(romanceProfile)
  registerGenreProfile(gameProfile)
  registerGenreProfile(lightnovelProfile)

  // 注册英文题材
  registerAllEnglishGenres()
}

export {
  xuanhuanProfile,
  xianxiaProfile,
  urbanProfile,
  historyProfile,
  mysteryProfile,
  scifiProfile,
  wuxiaProfile,
  romanceProfile,
  gameProfile,
  lightnovelProfile,
}
