import {existsSync} from 'node:fs';
import path from 'node:path';
import {LEGACY_PROFILE_NAME} from '@shared/branding';
/** Preserve the original npm application profile across display-name changes. */
export function applicationProfile(appData: string, exists: (file: string)=>boolean = existsSync): string {
  const candidates=[path.join(appData,LEGACY_PROFILE_NAME),path.join(appData,'File Preview')];
  return candidates.find(dir=>exists(path.join(dir,'preferences.json')))
    || candidates.find(dir=>exists(dir)) || candidates[0];
}
