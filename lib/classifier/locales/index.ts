import type { LocaleKeywordMap } from './types';
import { EN_HIGH, EN_MEDIUM } from './en';
import { ES_HIGH, ES_MEDIUM } from './es';
import { KO_HIGH, KO_MEDIUM } from './ko';
import { JA_HIGH, JA_MEDIUM } from './ja';
import { FR_HIGH, FR_MEDIUM } from './fr';
import { RU_HIGH, RU_MEDIUM } from './ru';
import { IT_HIGH, IT_MEDIUM } from './it';
import { PT_HIGH, PT_MEDIUM } from './pt';
import { ZH_HIGH, ZH_MEDIUM } from './zh';
import { VI_HIGH, VI_MEDIUM } from './vi';
import { NL_HIGH, NL_MEDIUM } from './nl';
import { DE_HIGH, DE_MEDIUM } from './de';
import { TR_HIGH, TR_MEDIUM } from './tr';
import { TH_HIGH, TH_MEDIUM } from './th';
import { FI_HIGH, FI_MEDIUM } from './fi';
import { CS_HIGH, CS_MEDIUM } from './cs';
import { PL_HIGH, PL_MEDIUM } from './pl';
import { LT_HIGH, LT_MEDIUM } from './lt';

function mergeKeywordMaps(maps: LocaleKeywordMap[]): LocaleKeywordMap {
  return maps.reduce<LocaleKeywordMap>((acc, map) => ({ ...acc, ...map }), {});
}

export const HIGH_PRIORITY_KEYWORDS = mergeKeywordMaps([
  EN_HIGH,
  ES_HIGH,
  KO_HIGH,
  JA_HIGH,
  FR_HIGH,
  RU_HIGH,
  IT_HIGH,
  PT_HIGH,
  ZH_HIGH,
  VI_HIGH,
  NL_HIGH,
  DE_HIGH,
  TR_HIGH,
  TH_HIGH,
  FI_HIGH,
  CS_HIGH,
  PL_HIGH,
  LT_HIGH,
]);

export const MEDIUM_PRIORITY_KEYWORDS = mergeKeywordMaps([
  EN_MEDIUM,
  ES_MEDIUM,
  KO_MEDIUM,
  JA_MEDIUM,
  FR_MEDIUM,
  RU_MEDIUM,
  IT_MEDIUM,
  PT_MEDIUM,
  ZH_MEDIUM,
  VI_MEDIUM,
  NL_MEDIUM,
  DE_MEDIUM,
  TR_MEDIUM,
  TH_MEDIUM,
  FI_MEDIUM,
  CS_MEDIUM,
  PL_MEDIUM,
  LT_MEDIUM,
]);
