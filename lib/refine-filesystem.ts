import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { extname, join } from 'path';
import { CANDIDATES_DIR, REFERENCES_DIR } from './paths';

export type SlotName = 'lifestyle' | 'detail';
const SLOTS: SlotName[] = ['lifestyle', 'detail'];

export interface CandidateInfo {
  filename: string;
  relativeUrl: string;
  fsPath: string;
}

export interface RoundInfo {
  roundNumber: number;
  dir: string;
  promptText: string | null;
  argsJson: Record<string, unknown> | null;
  candidates: CandidateInfo[];
}

export interface FamilyState {
  slot: SlotName;
  slug: string;
  rounds: RoundInfo[];
  lockedReferencePath: string | null;
  lockedReferenceExt: string | null;
}

export interface AppState {
  family: string;
  lifestyle: FamilyState;
  detail: FamilyState;
}

export function familyToSlug(family: string): string {
  return family
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function slugToFamily(slug: string): string {
  return slug
    .replace(/-and-/g, ' & ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function listRounds(slot: SlotName, slug: string): RoundInfo[] {
  const base = join(CANDIDATES_DIR, slot, slug);
  if (!existsSync(base)) return [];

  const roundDirs = readdirSync(base)
    .filter((d) => /^round-\d+$/.test(d))
    .map((d) => ({ name: d, number: parseInt(d.replace('round-', ''), 10) }))
    .sort((a, b) => b.number - a.number);

  return roundDirs.map(({ name, number }) => {
    const dir = join(base, name);
    const files = readdirSync(dir);
    const candidates: CandidateInfo[] = files
      .filter((f) => /^candidate-\d+\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .map((f) => ({
        filename: f,
        relativeUrl: `/api/refine/candidates/${slot}/${slug}/${name}/${f}`,
        fsPath: join(dir, f),
      }));

    const promptPath = join(dir, '_prompt.txt');
    const argsPath = join(dir, '_args.json');
    return {
      roundNumber: number,
      dir,
      promptText: existsSync(promptPath) ? readFileSync(promptPath, 'utf8') : null,
      argsJson: existsSync(argsPath)
        ? (JSON.parse(readFileSync(argsPath, 'utf8')) as Record<string, unknown>)
        : null,
      candidates,
    };
  });
}

export function findLockedReference(slot: SlotName, slug: string): string | null {
  const dir = join(REFERENCES_DIR, slot);
  if (!existsSync(dir)) return null;
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const p = join(dir, slug + ext);
    if (existsSync(p)) return p;
  }
  return null;
}

export function familyStateFor(slot: SlotName, family: string): FamilyState {
  const slug = familyToSlug(family);
  const lockedPath = findLockedReference(slot, slug);
  return {
    slot,
    slug,
    rounds: listRounds(slot, slug),
    lockedReferencePath: lockedPath,
    lockedReferenceExt: lockedPath
      ? extname(lockedPath).replace('.', '').toLowerCase()
      : null,
  };
}

export function discoverFamilies(): string[] {
  const families = new Map<string, string>();

  for (const slot of SLOTS) {
    const slotDir = join(CANDIDATES_DIR, slot);
    if (!existsSync(slotDir)) continue;
    try {
      const slugDirs = readdirSync(slotDir).filter((d) => {
        try { return statSync(join(slotDir, d)).isDirectory(); } catch { return false; }
      });
      for (const slug of slugDirs) {
        if (families.has(slug)) continue;
        const rounds = listRounds(slot, slug);
        const name = rounds.find((r) => r.argsJson?.family)?.argsJson?.family as string | undefined;
        families.set(slug, name ?? slugToFamily(slug));
      }
    } catch { /* ignore */ }
  }

  if (!families.has('clips-and-brackets')) families.set('clips-and-brackets', 'Clips & Brackets');
  if (!families.has('flexible-hoses')) families.set('flexible-hoses', 'Flexible Hoses');

  return Array.from(families.values()).sort();
}

export function nextRoundNumber(slot: SlotName, slug: string): number {
  const base = join(CANDIDATES_DIR, slot, slug);
  if (!existsSync(base)) return 1;
  const existing = readdirSync(base)
    .filter((d) => /^round-\d+$/.test(d))
    .map((d) => parseInt(d.replace('round-', ''), 10));
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}
