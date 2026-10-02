export interface RevenueDocData {
  stream1?: number;
  stream2?: number;
  stream3?: number;
  stream4?: number;
  totalGross?: number;
  totalWithdrawn?: number;
  unifiedAvailable?: number;
  [key: string]: any;
}

export interface RevenueResult {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  totalGross: number;
  totalWithdrawn: number;
  available: number;
}

/**
 * SINGLE SOURCE OF TRUTH FUNCTION getRevenue() - USE EVERYWHERE:
 * ALWAYS recalculates totalGross and available from component streams,
 * never trusting potentially desynced stored totalGross.
 */
export function getRevenue(docData: RevenueDocData | null | undefined): RevenueResult {
  if (!docData) {
    return { s1: 0, s2: 0, s3: 0, s4: 0, totalGross: 0, totalWithdrawn: 0, available: 0 };
  }
  const s1 = Math.floor(Number(docData.stream1 || 0));
  const s2 = Math.floor(Number(docData.stream2 || 0));
  const s3 = Math.floor(Number(docData.stream3 || 0));
  const s4 = Math.floor(Number(docData.stream4 || 0));
  const totalGross = s1 + s2 + s3 + s4; // ALWAYS recalc, never trust stored totalGross
  const totalWithdrawn = Math.floor(Number(docData.totalWithdrawn || 0));
  const available = Math.max(0, totalGross - totalWithdrawn);
  return { s1, s2, s3, s4, totalGross, totalWithdrawn, available };
}
