import {spawnSync} from 'node:child_process';
import {generateKeyPairSync,createPrivateKey,createPublicKey,randomUUID,sign} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {EXCLUSIVE_PROFILE,type ExclusiveLicense} from '@shared/exclusive';
import {verifyExclusiveKey} from '../electron/exclusive/verify';
const args=process.argv.slice(2),command=args[0];
const option=(name:string,fallback:string)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1]||fallback;};
const prefix=Buffer.from('MFBK1');
function protect(value:Buffer,decrypt=false):Buffer {
  if(process.platform!=='win32')throw Error('签发工具需要 Windows DPAPI，拒绝明文存储私钥。');
  const operation=decrypt?'Unprotect':'Protect';
  const script=`Add-Type -AssemblyName System.Security; $keyBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $entropy=[Text.Encoding]::UTF8.GetBytes('magic-file-box-issuer-v1'); $result=[Security.Cryptography.ProtectedData]::${operation}($keyBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:value.toString('base64'),encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  if(result.status!==0||!result.stdout.trim())throw Error('Windows 私钥保护操作失败。');
  return Buffer.from(result.stdout.trim(),'base64');
}
const privateFile=path.resolve(option('--key-file',path.join(process.env.APPDATA||path.join(homedir(),'AppData','Roaming'),'MagicFileBoxIssuer','issuer.dpapi')));
const publicFile=path.resolve('shared/exclusiveKey.ts');
const source=readFileSync(publicFile,'utf8');
const assigned=source.slice(source.indexOf('=',source.indexOf('EXCLUSIVE_PUBLIC_KEY'))+1).trim().replace(/;$/,'');
const configured=assigned==="''"?'':JSON.parse(assigned) as string;
function privatePem(){
  if(statSync(privateFile).size>32768)throw Error('签发私钥文件无效。');
  const bytes=readFileSync(privateFile);
  if(!bytes.subarray(0,prefix.length).equals(prefix))throw Error('签发私钥格式无效。');
  return protect(bytes.subarray(prefix.length),true).toString('utf8');
}
try {
 if(command==='init'){
  let publicPem:string;
  if(existsSync(privateFile)){
    publicPem=createPublicKey(createPrivateKey(privatePem())).export({type:'spki',format:'pem'}).toString();
    if(configured&&configured!==publicPem)throw Error('公钥与签发私钥不一致，拒绝自动换钥。');
  }else{
    if(configured)throw Error('客户端公钥已配置但签发私钥缺失，请恢复签发环境。');
    const pair=generateKeyPairSync('ed25519',{publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
    mkdirSync(path.dirname(privateFile),{recursive:true});writeFileSync(privateFile,Buffer.concat([prefix,protect(Buffer.from(pair.privateKey))]),{mode:0o600});publicPem=pair.publicKey;
  }
  writeFileSync(publicFile,'// Public verification key only. The issuer private key is not bundled.\nexport const EXCLUSIVE_PUBLIC_KEY = '+JSON.stringify(publicPem)+';\n');
  console.log('Windows-protected issuer key verified; public verification key configured.');
 }else if(command==='issue'){
  const key=createPrivateKey(privatePem()),publicPem=createPublicKey(key).export({type:'spki',format:'pem'}).toString();
  if(publicPem!==configured)throw Error('签发私钥与客户端公钥不一致。');
  const profile=option('--profile',EXCLUSIVE_PROFILE);if(profile!==EXCLUSIVE_PROFILE)throw Error('未知专属方案。');
  const payload:ExclusiveLicense={v:1,product:'magic-file-box',id:randomUUID(),subject:option('--subject','exclusive-user'),profile,features:['welcome'],issuedAt:Date.now()};
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url'),data='MFB1.'+body,token=data+'.'+sign(null,Buffer.from(data),key).toString('base64url');
  if(!verifyExclusiveKey(token,publicPem))throw Error('签发内容不符合软件校验规则。');
  const output=path.resolve(option('--out','outputs/exclusive-key.txt'));mkdirSync(path.dirname(output),{recursive:true});writeFileSync(output,token+'\n',{mode:0o600});
  console.log('KEY saved to '+output+'; contents are not logged.');
 }else throw Error('Usage: npm run exclusive:key -- init | issue --subject user-id --out file.txt');
}catch(error){console.error(error instanceof Error?error.message:'Signing tool failed');process.exitCode=1;}
