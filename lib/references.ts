import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { REFERENCES_DIR } from './paths';
import { ImageSlot, SLOT_NAMES } from './types';

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export interface ReferenceImage {
  path: string;
  mimeType: string;
  source: 'family' | 'default';
  family: string | null;
}

export function familyToSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function findFileWithAnyExt(dir: string, baseName: string): string | null {
  for (const ext of SUPPORTED_EXTENSIONS) {
    const candidate = join(dir, baseName + ext);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function slotDir(slot: ImageSlot): string {
  return join(REFERENCES_DIR, SLOT_NAMES[slot].toLowerCase());
}

export function resolveReference(
  slot: ImageSlot,
  productFamily: string | null
): ReferenceImage | null {
  if (slot !== 2 && slot !== 3) return null;
  const dir = slotDir(slot);
  if (!existsSync(dir)) return null;

  if (productFamily) {
    const slug = familyToSlug(productFamily);
    if (slug) {
      const familyPath = findFileWithAnyExt(dir, slug);
      if (familyPath) {
        const ext = '.' + familyPath.split('.').pop()!.toLowerCase();
        return { path: familyPath, mimeType: MIME_BY_EXT[ext] ?? 'image/jpeg', source: 'family', family: productFamily };
      }
    }
  }

  const defaultPath = findFileWithAnyExt(dir, '_default');
  if (defaultPath) {
    const ext = '.' + defaultPath.split('.').pop()!.toLowerCase();
    return { path: defaultPath, mimeType: MIME_BY_EXT[ext] ?? 'image/jpeg', source: 'default', family: null };
  }

  return null;
}

export function loadReferenceBase64(ref: ReferenceImage): string {
  return readFileSync(ref.path).toString('base64');
}

export function describeRegistry(): string[] {
  const lines: string[] = [];
  for (const slot of [2, 3] as ImageSlot[]) {
    const dir = slotDir(slot);
    if (!existsSync(dir)) {
      lines.push(`  ${SLOT_NAMES[slot]}: no folder`);
      continue;
    }
    const def = findFileWithAnyExt(dir, '_default');
    lines.push(`  ${SLOT_NAMES[slot]}:`);
    lines.push(`    _default: ${def ?? '(none)'}`);
    try {
      const files = readdirSync(dir) as string[];
      const familyFiles = files.filter((f) => {
        const lower = f.toLowerCase();
        return SUPPORTED_EXTENSIONS.some((e) => lower.endsWith(e)) && !lower.startsWith('_');
      }).sort();
      for (const f of familyFiles) {
        lines.push(`    ${f.replace(/\.[^.]+$/, '')}: ${join(dir, f)}`);
      }
    } catch { /* ignore */ }
  }
  return lines;
}
