import {createPublicKey, verify} from 'node:crypto';
import {EXCLUSIVE_KEY_LIMIT, EXCLUSIVE_PROFILE, type ExclusiveLicense} from '@shared/exclusive';

export function verifyExclusiveKey(input: unknown, publicKey: string): ExclusiveLicense | undefined {
  if(typeof input !== 'string' || input.length > EXCLUSIVE_KEY_LIMIT) return;
  const token = input.trim();
  const parts = token.split('.');
  if(parts.length !== 3 || parts[0] !== 'MFB1') return;
  const decode = (value: string) => {
    if(!/^[A-Za-z0-9_-]+$/.test(value)) throw Error('Invalid encoding');
    const bytes = Buffer.from(value, 'base64url');
    if(bytes.toString('base64url') !== value) throw Error('Noncanonical encoding');
    return bytes;
  };
  try {
    const data = decode(parts[1]), signature = decode(parts[2]);
    const key = createPublicKey(publicKey);
    if(signature.length !== 64 || key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from('MFB1.'+parts[1]), key, signature)) return;
    const value = JSON.parse(data.toString('utf8'));
    const fields = ['v','product','id','subject','profile','features','issuedAt'];
    if(!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || !fields.every(f=>Object.hasOwn(value,f))) return;
    if(value.v !== 1 || value.product !== 'magic-file-box' || value.profile !== EXCLUSIVE_PROFILE) return;
    if(typeof value.id !== 'string' || !/^[a-f0-9-]{36}$/.test(value.id)) return;
    if(typeof value.subject !== 'string' || !value.subject.trim() || value.subject.length > 80 || /[\x00-\x1f\x7f]/.test(value.subject)) return;
    if(!Array.isArray(value.features) || value.features.length !== 1 || value.features[0] !== 'welcome') return;
    if(!Number.isSafeInteger(value.issuedAt) || value.issuedAt <= 0) return;
    return value as ExclusiveLicense;
  } catch {return;}
}
