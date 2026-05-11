import { existsSync, readFileSync, writeFileSync } from 'fs';

export interface CheckpointEntry {
  sku: string;
  slot: number;
  status: 'done' | 'blocked' | 'error';
  attemptedAt: string;
  errorMessage?: string;
}

export interface DailyUsage {
  date: string;
  count: number;
}

interface CheckpointData {
  completed: Record<string, CheckpointEntry>;
  dailyUsage: DailyUsage;
}

const FREE_TIER_DAILY_LIMIT = 500;

export class Checkpoint {
  private data: CheckpointData;

  constructor(private path: string) {
    this.data = this.load();
    this.rolloverIfNewDay();
  }

  private load(): CheckpointData {
    if (!existsSync(this.path)) {
      return {
        completed: {},
        dailyUsage: { date: utcDateString(), count: 0 },
      };
    }
    return JSON.parse(readFileSync(this.path, 'utf8'));
  }

  private save() {
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }

  private rolloverIfNewDay() {
    const today = utcDateString();
    if (this.data.dailyUsage.date !== today) {
      this.data.dailyUsage = { date: today, count: 0 };
      this.save();
    }
  }

  private key(sku: string, slot: number) {
    return `${sku}|${slot}`;
  }

  isDone(sku: string, slot: number): boolean {
    return this.data.completed[this.key(sku, slot)]?.status === 'done';
  }

  isBlocked(sku: string, slot: number): boolean {
    return this.data.completed[this.key(sku, slot)]?.status === 'blocked';
  }

  markDone(sku: string, slot: number) {
    this.data.completed[this.key(sku, slot)] = {
      sku, slot, status: 'done', attemptedAt: new Date().toISOString(),
    };
    this.save();
  }

  markBlocked(sku: string, slot: number, errorMessage: string) {
    this.data.completed[this.key(sku, slot)] = {
      sku, slot, status: 'blocked', attemptedAt: new Date().toISOString(), errorMessage,
    };
    this.save();
  }

  markError(sku: string, slot: number, errorMessage: string) {
    this.data.completed[this.key(sku, slot)] = {
      sku, slot, status: 'error', attemptedAt: new Date().toISOString(), errorMessage,
    };
    this.save();
  }

  shouldAttempt(sku: string, slot: number): boolean {
    return !this.isDone(sku, slot) && !this.isBlocked(sku, slot);
  }

  incrementDailyUsage() {
    this.rolloverIfNewDay();
    this.data.dailyUsage.count += 1;
    this.save();
  }

  remainingFreeTierToday(): number {
    this.rolloverIfNewDay();
    return Math.max(0, FREE_TIER_DAILY_LIMIT - this.data.dailyUsage.count);
  }

  dailyUsageCount(): number {
    this.rolloverIfNewDay();
    return this.data.dailyUsage.count;
  }

  summary() {
    const entries = Object.values(this.data.completed);
    return {
      done: entries.filter((e) => e.status === 'done').length,
      blocked: entries.filter((e) => e.status === 'blocked').length,
      errored: entries.filter((e) => e.status === 'error').length,
      dailyUsage: this.data.dailyUsage,
    };
  }

  getEntries(): CheckpointEntry[] {
    return Object.values(this.data.completed);
  }
}

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
