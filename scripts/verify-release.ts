import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

// Read-only artifact checks; write checksums only after every check succeeds.
// Default: installer only. Pass --zip to also require and verify the portable ZIP.
const args = process.argv.slice(2);
const wantZip = args.includes('--zip');
const root = resolve(args.find((a) => !a.startsWith('-')) || 'outputs/release');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const setupName = `MagicFileBox-Setup-${version}-x64.exe`;
const zipName = `MagicFileBox-${version}-Windows-x64.zip`;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const setup = await readFile(resolve(root, setupName));
const asar = await readFile(resolve(root, 'win-unpacked/resources/app.asar'));
if (setup.toString('ascii', 0, 2) !== 'MZ' || setup.length <= asar.length)
  throw Error('安装包缺失应用载荷或不是 Windows EXE，禁止交付。');
// A final NSIS installer contains its NSIS archive header; a PE stub does not suffice.
if (!setup.includes(Buffer.from('NullsoftInst')))
  throw Error('安装包缺少 NSIS 标识，禁止交付。');
if ((await stat(resolve(root, setupName + '.blockmap'))).size === 0)
  throw Error('安装包缺少完成阶段生成的 blockmap。');
const lines = [`${hash(setup)}  ${setupName}`];
if (wantZip) {
  const zipBytes = await readFile(resolve(root, zipName));
  const zip = await JSZip.loadAsync(zipBytes, { checkCRC32: true });
  for (const relative of ['magic file box.exe', 'resources/app.asar']) {
    const entry = zip.file(relative);
    if (!entry) throw Error(`ZIP 缺少 ${relative}`);
    const packaged = await entry.async('uint8array');
    const unpacked = await readFile(resolve(root, 'win-unpacked', relative));
    if (hash(packaged) !== hash(unpacked)) throw Error(`ZIP 与构建目录不一致：${relative}`);
  }
  lines.push(`${hash(zipBytes)}  ${zipName}`);
  console.log('PASS 安装包结构、完成标记、ZIP CRC 与应用一致性；已生成 SHA256SUMS.txt。');
} else {
  console.log('PASS 安装包结构与完成标记；已生成 SHA256SUMS.txt（未校验 ZIP）。');
}
await writeFile(resolve(root, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log('仍需安装与启动验收；结构检查不能替代真实安装。');
