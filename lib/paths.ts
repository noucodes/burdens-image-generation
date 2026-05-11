import { join, resolve } from 'path';

export const ROOT_DIR = resolve(process.cwd());
export const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? resolve(process.env.OUTPUT_DIR)
  : join(ROOT_DIR, 'output');
export const REFERENCES_DIR = process.env.REFERENCES_DIR
  ? resolve(process.env.REFERENCES_DIR)
  : join(ROOT_DIR, 'references');
export const CANDIDATES_DIR = process.env.CANDIDATES_DIR
  ? resolve(process.env.CANDIDATES_DIR)
  : join(ROOT_DIR, 'references-candidates');
export const GAP_REPORT_PATH = process.env.GAP_REPORT_PATH
  ? resolve(process.env.GAP_REPORT_PATH)
  : join(ROOT_DIR, 'gap-report.json');
