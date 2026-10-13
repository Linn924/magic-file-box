import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
} from "node:fs";
for (const name of ["cmaps", "standard_fonts", "wasm"]) {
  mkdirSync(`dist/pdf-assets/${name}`, { recursive: true });
  cpSync(`node_modules/pdfjs-dist/${name}`, `dist/pdf-assets/${name}`, {
    recursive: true,
  });
}
const visited = new Set();
const notices = [
  "File Preview 3.3 — third-party notices\nBundled libraries retain their original licenses.\n",
];
function collect(name: string, parent = ".") {
  let dir = `${parent}/node_modules/${name}`;
  if (!existsSync(`${dir}/package.json`)) dir = `node_modules/${name}`;
  if (!existsSync(`${dir}/package.json`) || visited.has(dir)) return;
  visited.add(dir);
  const p = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  notices.push(
    `\n${p.name} ${p.version}\nLicense: ${p.license || "See bundled license"}\n`,
  );
  for (const f of readdirSync(dir))
    if (/^(license|licence|notice|copyright)(\.|$)/i.test(f)) {
      try {
        notices.push(readFileSync(`${dir}/${f}`, "utf8"));
      } catch {}
    }
  for (const dependency of Object.keys(p.dependencies || {}))
    collect(dependency, dir);
}
for (const name of [
  "electron",
  "vue",
  "xlsx",
  "exceljs",
  "docx-preview",
  "@file-viewer/doc",
  "@aiden0z/pptx-renderer",
  "@web-ppt/core",
  "pdfjs-dist",
  "dompurify",
  "marked",
  "shiki",
])
  collect(name);
writeFileSync("dist/THIRD-PARTY-NOTICES.txt", notices.join("\n"));
