import type { Extraction } from './schemas';
export type ImportTransport = (path: string, init?: RequestInit) => Promise<Response>;
export const browserImportTransport: ImportTransport = (path, init) => fetch(path, init);
export type ImportData = { importId: string; status: string; version: string; extraction: Extraction; expiresAt: string };
export type ImportPreview = { previewId: string; targetVersion: string; changes: { key: string; before: string; after: string }[] };
