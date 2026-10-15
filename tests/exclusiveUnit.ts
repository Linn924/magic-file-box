import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {verifyExclusiveKey} from '../electron/exclusive/verify';
import {ExclusiveStore} from '../electron/exclusive/store';
import {EXCLUSIVE_PROFILE} from '@shared/exclusive';
import {EXCLUSIVE_PUBLIC_KEY} from '@shared/exclusiveKey';
const keys=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const payload={v:1,product:'magic-file-box',id:randomUUID(),subject:'Test <user>',profile:EXCLUSIVE_PROFILE,features:['welcome'],issuedAt:Date.now()};
const issue=(value:unknown)=>{const body=Buffer.from(JSON.stringify(value)).toString('base64url'),data='MFB1.'+body;return data+'.'+sign(null,Buffer.from(data),keys.privateKey).toString('base64url');};
const token=issue(payload);
assert.deepEqual(verifyExclusiveKey(token,keys.publicKey),payload);
assert.equal(verifyExclusiveKey(token,EXCLUSIVE_PUBLIC_KEY),undefined,'production does not trust test issuer keys');
for(const input of [null,{},'', 'x'.repeat(4097),'MFB1.a.b',token.replace('MFB1.','MFB2.'),token.slice(0,-4)+'AAAA',token+'.extra','<script>alert(1)</script>'])assert.equal(verifyExclusiveKey(input,keys.publicKey),undefined);
for(const patch of [{v:2},{product:'other'},{profile:'unknown'},{features:['welcome','arbitrary-script']},{subject:'bad\nname'},{subject:'x'.repeat(81)},{issuedAt:0},{issuedAt:1.5},{id:'bad'},{unexpected:true}])assert.equal(verifyExclusiveKey(issue({...payload,...patch}),keys.publicKey),undefined);
mkdirSync('.test-build',{recursive:true});const root=mkdtempSync(path.resolve('.test-build/exclusive-unit-')),file=path.join(root,'exclusive.bin');
const encrypted={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s).reverse(),decryptString:(b:Buffer)=>Buffer.from(b).reverse().toString()};
try {
 const first=new ExclusiveStore(file,keys.publicKey,encrypted);assert.equal(first.snapshot().active,false);
 const pending=first.activate(token);assert.equal(pending.active,false);assert.equal(pending.pendingRestart,true);assert.ok(!readFileSync(file).includes(token));
 assert.throws(()=>first.activate('invalid'));assert.equal(first.snapshot().pendingRestart,true);
 const restarted=new ExclusiveStore(file,keys.publicKey,encrypted);assert.equal(restarted.snapshot().active,true);assert.equal(restarted.snapshot().pendingRestart,false);assert.equal(restarted.snapshot().subject,payload.subject);
 assert.equal(restarted.clear().active,true);assert.equal(restarted.snapshot().pendingRestart,true);assert.equal(new ExclusiveStore(file,keys.publicKey,encrypted).snapshot().active,false);
 writeFileSync(file,'corrupt encrypted payload');assert.equal(new ExclusiveStore(file,keys.publicKey,encrypted).snapshot().active,false);
 const unavailable=new ExclusiveStore(file,keys.publicKey,{...encrypted,isEncryptionAvailable:()=>false});assert.equal(unavailable.snapshot().canActivate,false);assert.throws(()=>unavailable.activate(token));
 console.log('PASS exclusive signatures, canonical bounded input, product/profile/feature validation, encrypted persistence and restart-only activation/reset.');
}finally{assert.ok(root.startsWith(path.resolve('.test-build')+path.sep));rmSync(root,{recursive:true,force:true});}
