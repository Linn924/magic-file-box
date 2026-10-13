import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {verifyUpdateArtifacts} from './updateArtifacts';
const {version}=JSON.parse(await readFile('package.json','utf8'));
await verifyUpdateArtifacts(path.resolve(process.argv[2]||'outputs/release'),version);
console.log('PASS 更新版本、完整 NSIS 包、SHA512、blockmap 和无签名 GitHub 更新源一致。');
