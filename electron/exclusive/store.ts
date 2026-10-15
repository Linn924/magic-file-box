import {existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, statSync} from 'node:fs';
import path from 'node:path';
import type {ExclusiveLicense, ExclusiveState} from '@shared/exclusive';
import {EXCLUSIVE_KEY_LIMIT} from '@shared/exclusive';
import {verifyExclusiveKey} from './verify';

export interface LicenseEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class ExclusiveStore {
  private readonly bootToken: string;
  private readonly activeLicense: ExclusiveLicense | undefined;
  private savedToken: string;
  constructor(private readonly file: string, private readonly publicKey: string, private readonly encryption: LicenseEncryption) {
    this.savedToken = this.bootToken = this.read();
    this.activeLicense = verifyExclusiveKey(this.bootToken, this.publicKey);
  }
  private read(): string {
    try {
      if(!this.encryption.isEncryptionAvailable() || !existsSync(this.file) || statSync(this.file).size > 32768) return '';
      const token = this.encryption.decryptString(readFileSync(this.file));
      return verifyExclusiveKey(token, this.publicKey) ? token : '';
    } catch {return '';}
  }
  snapshot(): ExclusiveState {
    return {active: !!this.activeLicense, profile: this.activeLicense?.profile, subject: this.activeLicense?.subject,
      pendingRestart: this.savedToken !== this.bootToken, canActivate: this.encryption.isEncryptionAvailable()};
  }
  activate(input: unknown): ExclusiveState {
    if(!verifyExclusiveKey(input, this.publicKey)) throw Error('KEY 无效或与本软件不匹配。');
    if(!this.encryption.isEncryptionAvailable()) throw Error('本机安全存储不可用，无法保存专属设置。');
    const token = (input as string).trim();
    if(token.length > EXCLUSIVE_KEY_LIMIT) throw Error('KEY 无效。');
    const encrypted = this.encryption.encryptString(token);
    mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = this.file+'.tmp';
    try {writeFileSync(temporary, encrypted, {mode: 0o600});renameSync(temporary, this.file);}
    catch {try{unlinkSync(temporary);}catch{}throw Error('专属设置保存失败，请重试。');}
    this.savedToken = token;
    return this.snapshot();
  }
  clear(): ExclusiveState {
    try {if(existsSync(this.file)) unlinkSync(this.file);}catch {throw Error('专属设置清除失败，请重试。');}
    this.savedToken = '';
    return this.snapshot();
  }
}
