export interface AssetEntry {
  key: string;
  constant: string;
  source: string;
  frame: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
  category?: string;
  ninePatch?: { left: number; top: number; right: number; bottom: number };
}

export const assetManifest: { assets: AssetEntry[] };
export const Assets: Record<string, string>;
