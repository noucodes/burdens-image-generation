import { join, resolve } from 'path';
import { writableDir } from './settings';

export const ROOT_DIR = resolve(process.cwd());

const DATA_DIR = writableDir();

export const OUTPUT_DIR = process.env.OUTPUT_DIR
  ? resolve(process.env.OUTPUT_DIR)
  : join(DATA_DIR, 'output');
export const REFERENCES_DIR = process.env.REFERENCES_DIR
  ? resolve(process.env.REFERENCES_DIR)
  : join(DATA_DIR, 'references');
export const CANDIDATES_DIR = process.env.CANDIDATES_DIR
  ? resolve(process.env.CANDIDATES_DIR)
  : join(DATA_DIR, 'references-candidates');
export const GAP_REPORT_PATH = process.env.GAP_REPORT_PATH
  ? resolve(process.env.GAP_REPORT_PATH)
  : join(DATA_DIR, 'gap-report.json');
