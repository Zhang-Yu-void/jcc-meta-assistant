import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { MetaBundle } from "@jcc/meta-schema";
import { fingerprintFromRgba } from "@jcc/screen-match";

export function applyPortraitFingerprints(bundle: MetaBundle, portraitDir: string): number {
  if (!existsSync(portraitDir)) return 0;
  const files = new Set(
    readdirSync(portraitDir)
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .map((f) => f.toLowerCase()),
  );
  let updated = 0;
  for (const champ of bundle.champions) {
    const file = `${champ.id}.png`;
    if (!files.has(file.toLowerCase())) continue;
    const buf = readFileSync(path.join(portraitDir, file));
    const png = PNG.sync.read(buf);
    champ.fingerprint = fingerprintFromRgba(png.width, png.height, png.data);
    champ.portrait = champ.portrait || `/v1/portraits/${champ.id}.png`;
    updated += 1;
  }
  return updated;
}
