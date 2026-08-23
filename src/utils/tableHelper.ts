import { ColumnDef, TableRow } from "../types";

/**
 * Normalizes a Vietnamese string for comparison (removes accents, spaces, special chars, lowercases)
 */
export function normalizeHeaderString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

// Common Vietnamese table header terms
const COMMON_HEADER_WORDS = [
  "stt",
  "sothutu",
  "tenhang",
  "tenhanghoa",
  "tenhanghoadichvu",
  "dichvu",
  "donvitinh",
  "dvt",
  "soluong",
  "dongia",
  "thanhtien",
  "ghichu",
  "mahang",
  "masothue",
  "thuesuat",
  "tienthue",
  "tongcong",
  "congtienhang",
  "ngaythang",
  "sotien",
  "diengiai",
  "ngay",
  "hoten",
  "chucvu",
  "mota",
];

/**
 * Determines if a row is likely a recognized duplicate header row rather than genuine data.
 */
export function isDuplicateHeaderRow(row: TableRow, columns: ColumnDef[]): boolean {
  if (!row || columns.length === 0) return false;

  const normalizedColNames = columns.map((c) => ({
    name: normalizeHeaderString(c.name),
    key: normalizeHeaderString(c.key),
  }));

  let headerMatchCount = 0;
  let totalNonEmptyCells = 0;

  for (const col of columns) {
    const rawVal = row[col.key];
    if (rawVal === undefined || rawVal === null || String(rawVal).trim() === "") {
      continue;
    }
    totalNonEmptyCells++;
    const normVal = normalizeHeaderString(String(rawVal));

    // Check if cell value matches any column name, column key, or standard header dictionary terms
    const isColMatch = normalizedColNames.some(
      (c) => c.name === normVal || (normVal.length >= 3 && (c.name.includes(normVal) || normVal.includes(c.name)))
    );
    const isDictionaryMatch = COMMON_HEADER_WORDS.some(
      (w) => w === normVal || (normVal.length >= 4 && (w.includes(normVal) || normVal.includes(w)))
    );

    if (isColMatch || isDictionaryMatch) {
      headerMatchCount++;
    }
  }

  // If at least 2 cells or >40% of non-empty cells match header definitions and there are at least 2 matches
  if (totalNonEmptyCells >= 2 && headerMatchCount >= 2 && headerMatchCount / totalNonEmptyCells >= 0.4) {
    return true;
  }

  return false;
}

/**
 * Filter out all duplicate header rows from the dataset
 */
export function removeDuplicateHeaderRows(
  rows: TableRow[],
  columns: ColumnDef[]
): { cleanRows: TableRow[]; removedCount: number; removedRows: TableRow[] } {
  const cleanRows: TableRow[] = [];
  const removedRows: TableRow[] = [];

  for (const row of rows) {
    if (isDuplicateHeaderRow(row, columns)) {
      removedRows.push(row);
    } else {
      cleanRows.push(row);
    }
  }

  return {
    cleanRows,
    removedCount: removedRows.length,
    removedRows,
  };
}
