import { build } from "esbuild";
import {buildNativeLoading} from './build-native-loading';
buildNativeLoading();
await build({
  tsconfig: 'tsconfig.electron.json',
  entryPoints: { main: "electron/main.ts", preload: "electron/preload.ts" },
  outdir: "electron-dist",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron","electron-updater"],
  outExtension: { ".js": ".cjs" },
});
