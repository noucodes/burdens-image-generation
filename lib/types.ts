export type ImageSlot = 1 | 2 | 3 | 4;

export const SLOT_NAMES: Record<ImageSlot, string> = {
  1: 'Main',
  2: 'Detail',
  3: 'Lifestyle',
  4: 'Scale',
};

export interface SkuAuditRow {
  sku: string;
  productId: number | null;
  productTitle: string | null;
  productType: string | null;
  vendor: string | null;
  existingSlots: ImageSlot[];
  missingSlots: ImageSlot[];
  mainImageUrl: string | null;
  status: 'complete' | 'needs_generation' | 'no_main_image' | 'not_found';
}

export interface GapReport {
  generatedAt: string;
  totalSkus: number;
  complete: number;
  needsGeneration: number;
  missingMain: number;
  notFound: number;
  rows: SkuAuditRow[];
}

export interface GenerationJob {
  sku: string;
  slot: ImageSlot;
  referenceImageUrl: string;
  productContext: {
    title: string;
    productType: string;
    vendor: string;
  };
}

export interface GenerationResult {
  sku: string;
  slot: ImageSlot;
  outputPath: string;
  prompt: string;
  modelVersion: string;
  generatedAt: string;
  approved: boolean;
}
