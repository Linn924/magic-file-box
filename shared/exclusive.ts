export const EXCLUSIVE_KEY_LIMIT = 4096;
export const EXCLUSIVE_PROFILE = 'welcome-01' as const;
export interface ExclusiveLicense {
  v: 1;
  product: 'magic-file-box';
  id: string;
  subject: string;
  profile: typeof EXCLUSIVE_PROFILE;
  features: ['welcome'];
  issuedAt: number;
}
export interface ExclusiveState {
  active: boolean;
  profile?: typeof EXCLUSIVE_PROFILE;
  subject?: string;
  pendingRestart: boolean;
  canActivate: boolean;
}
