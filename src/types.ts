export type ColumnType = "text" | "number" | "currency" | "date" | "code";

export interface ColumnDef {
  id: string;
  name: string;
  key: string;
  type: ColumnType;
  description?: string;
  width?: number;
}

export interface DocumentPage {
  pageNumber: number;
  imageUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface CropArea {
  id: string;
  pageNumber: number;
  x: number; // percentage or pixel coordinate
  y: number;
  width: number;
  height: number;
  label?: string;
  status: "idle" | "scanning" | "success" | "error";
  errorMessage?: string;
  extractedRowCount?: number;
  croppedImageUrl?: string;
  selectedForScan?: boolean;
}

export interface TableRow {
  _id: string;
  _pageNumber?: number;
  _cropId?: string;
  _isModified?: boolean;
  [columnKey: string]: any;
}

export interface ExtractionHistoryItem {
  id: string;
  timestamp: number;
  pageCount: number;
  rowCount: number;
  filename: string;
  columns: ColumnDef[];
  rows: TableRow[];
}

export interface VietnamesePreset {
  id: string;
  title: string;
  description: string;
  category: "invoice" | "inventory" | "payroll" | "general" | "custom";
  columns: Array<{ name: string; key: string; type: ColumnType; description?: string }>;
}

export type BulkFileStatus = "queued" | "loading" | "detecting" | "scanning" | "completed" | "error";

export interface BulkFileItem {
  id: string;
  file?: File;
  fileName: string;
  fileSize: number;
  status: BulkFileStatus;
  progress: number; // 0 - 100
  statusMessage: string;
  pages: DocumentPage[];
  cropAreas: CropArea[];
  columns: ColumnDef[];
  rows: TableRow[];
  errorMessage?: string;
}

export interface BulkProcessingOptions {
  mergeFiles: boolean; // Gộp tất cả tệp vào 1 bảng duy nhất (true) hay giữ riêng (false)
  sameColumns: boolean; // Dùng chung 1 mẫu cột cho tất cả (true) hay tự nhận diện riêng từng file (false)
  includeFileNameColumn: boolean; // Thêm cột Tên tệp gốc khi gộp bảng
  removeDuplicateHeaders: boolean; // Tự động lọc bỏ các dòng tiêu đề lặp lại
  semiAutoPause: boolean; // Dừng sau khi nhận diện cột tệp đầu tiên nếu chọn sameColumns
}
