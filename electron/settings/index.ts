import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
} from "node:fs";
import path from "node:path";
import {
  defaults,
  normalizeSettings,
  type Settings,
} from "@shared/contracts";
export class SettingsStore {
  private value: Settings;
  constructor(private readonly file: string) {
    try {
      this.value = normalizeSettings(
        existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : defaults,
      );
    } catch {
      this.value = { ...defaults };
    }
  }
  get(): Settings {
    return structuredClone(this.value);
  }
  update(input: Partial<Settings>): Settings {
    const next = normalizeSettings(input, this.value);
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file + ".tmp", JSON.stringify(next, null, 2), "utf8");
    renameSync(this.file + ".tmp", this.file);
    this.value = next;
    return this.get();
  }
}
