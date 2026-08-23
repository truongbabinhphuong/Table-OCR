import React, { useState, useRef } from "react";
import {
  ColumnDef,
  ColumnType,
  TableRow,
  BulkFileItem,
  BulkProcessingOptions,
  DocumentPage,
  VietnamesePreset,
} from "../types";
import { loadPdfPages, loadImagePage, cropImageArea, generateSampleDocument } from "../utils/pdfHelper";
import { removeDuplicateHeaderRows } from "../utils/tableHelper";
import { exportToExcel, exportMultiSheetExcel, exportZipFiles, exportToCSV } from "../utils/excelExport";
import { VIETNAMESE_PRESETS } from "../data/presets";
import { TableEditor } from "./TableEditor";
import { detectColumnsAPI, extractTableAPI, detectTableBoxAPI } from "../services/geminiOcrService";
import {
  Files,
  Upload,
  Sparkles,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Play,
  Square,
  FileArchive,
  Download,
  ArrowRight,
  Split,
  Merge,
  Table as TableIcon,
  RefreshCw,
  Plus,
  Info,
  Check,
  ChevronRight,
  Eye,
  Sliders,
  Settings2,
  FileText,
  Zap,
  Edit3,
  X,
  ChevronUp,
  ChevronDown,
  Hash,
  Coins,
  Calendar,
  Code,
  Type as TypeIcon,
  SlidersHorizontal,
} from "lucide-react";

interface BulkProcessorProps {
  onShowNotification?: (type: "success" | "error" | "info", msg: string) => void;
}

export const BulkProcessor: React.FC<BulkProcessorProps> = ({ onShowNotification }) => {
  // Bulk file queue
  const [fileQueue, setFileQueue] = useState<BulkFileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [currentProcessingFileId, setCurrentProcessingFileId] = useState<string | null>(null);
  const [processingStatusText, setProcessingStatusText] = useState<string>("");

  // Processing Options
  const [options, setOptions] = useState<BulkProcessingOptions>({
    mergeFiles: true,
    sameColumns: true,
    includeFileNameColumn: true,
    removeDuplicateHeaders: true,
    semiAutoPause: false,
  });

  // Global Unified Columns (when sameColumns is true)
  const [globalColumns, setGlobalColumns] = useState<ColumnDef[]>([
    { id: "col-1", name: "STT", key: "stt", type: "number" },
    { id: "col-2", name: "Tên hàng hóa, quy cách", key: "tenHangHoa", type: "text" },
    { id: "col-3", name: "Đơn vị tính", key: "dvt", type: "text" },
    { id: "col-4", name: "Số lượng", key: "soLuong", type: "number" },
    { id: "col-5", name: "Đơn giá", key: "donGia", type: "currency" },
    { id: "col-6", name: "Thành tiền", key: "thanhTien", type: "currency" },
  ]);

  // Selected file for inspection when mergeFiles is false
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  // Modal for editing single file columns & manual controls
  const [editingFileModalItem, setEditingFileModalItem] = useState<BulkFileItem | null>(null);

  // Modal for configuring and confirming 1-Click Auto / Semi-Auto batch scan
  const [batchSetupModalMode, setBatchSetupModalMode] = useState<"auto" | "semi-auto" | null>(null);

  // Semi-auto file-by-file column confirmation state
  const [semiAutoConfirmModalItem, setSemiAutoConfirmModalItem] = useState<{
    fileId: string;
    fileName: string;
    fileIndex: number;
    totalFiles: number;
    columns: ColumnDef[];
    pagePreviewUrl?: string;
    totalPages: number;
  } | null>(null);

  // Flag indicating all columns have been configured and ready for full batch OCR
  const [allColumnsConfiguredReady, setAllColumnsConfiguredReady] = useState<boolean>(false);

  // Semi-auto review state in bulk mode (paused to modify columns)
  const [isWaitingSemiAutoReview, setIsWaitingSemiAutoReview] = useState<boolean>(false);
  const [semiAutoSourceFileName, setSemiAutoSourceFileName] = useState<string>("");

  // Editable output filename
  const [bulkExportFilename, setBulkExportFilename] = useState<string>("tong_hop_ocr_hang_loat");

  // Abort controller ref for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStopRequestedRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const notify = (type: "success" | "error" | "info", msg: string) => {
    if (onShowNotification) {
      onShowNotification(type, msg);
    }
  };

  // Helper to get icon for column type
  const getTypeIcon = (type: ColumnType) => {
    switch (type) {
      case "number":
        return <Hash className="w-3 h-3 text-blue-500" />;
      case "currency":
        return <Coins className="w-3 h-3 text-emerald-500" />;
      case "date":
        return <Calendar className="w-3 h-3 text-amber-500" />;
      case "code":
        return <Code className="w-3 h-3 text-purple-500" />;
      default:
        return <TypeIcon className="w-3 h-3 text-slate-500" />;
    }
  };

  // Handle uploading multiple files
  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const newItems: BulkFileItem[] = [];

    for (const file of fileArray) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const isImg = file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name);

      if (!isPdf && !isImg) {
        notify("info", `Bỏ qua file "${file.name}" do không thuộc định dạng PDF hoặc Ảnh`);
        continue;
      }

      const id = `bulk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      newItems.push({
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        status: "queued",
        progress: 0,
        statusMessage: "Đang chờ xử lý trong hàng đợi",
        pages: [],
        cropAreas: [],
        columns: globalColumns.map((c) => ({ ...c, id: `col-${id}-${c.key}` })),
        rows: [],
      });
    }

    if (newItems.length > 0) {
      setFileQueue((prev) => [...prev, ...newItems]);
      if (!selectedFileId) {
        setSelectedFileId(newItems[0].id);
      }
      notify("success", `Đã thêm ${newItems.length} tệp vào danh sách xử lý`);
    }
  };

  // Load 3 sample files for immediate testing
  const handleLoadSampleBatch = () => {
    try {
      const invoicePages = generateSampleDocument("invoice");
      const inventoryPages = generateSampleDocument("inventory");
      const payrollPages = generateSampleDocument("payroll");

      const samples: BulkFileItem[] = [
        {
          id: `sample-invoice-${Date.now()}`,
          fileName: "Hoa_don_GTGT_01.pdf",
          fileSize: 245000,
          status: "queued",
          progress: 0,
          statusMessage: "Tài liệu mẫu sẵn sàng xử lý",
          pages: invoicePages,
          cropAreas: [],
          columns: globalColumns.map((c) => ({ ...c, id: `col-inv-${c.key}` })),
          rows: [],
        },
        {
          id: `sample-inventory-${Date.now() + 1}`,
          fileName: "Bang_ke_vat_tu_kho_02.pdf",
          fileSize: 310000,
          status: "queued",
          progress: 0,
          statusMessage: "Tài liệu mẫu sẵn sàng xử lý",
          pages: inventoryPages,
          cropAreas: [],
          columns: globalColumns.map((c) => ({ ...c, id: `col-invt-${c.key}` })),
          rows: [],
        },
        {
          id: `sample-payroll-${Date.now() + 2}`,
          fileName: "Bang_luong_nhan_su_03.pdf",
          fileSize: 290000,
          status: "queued",
          progress: 0,
          statusMessage: "Tài liệu mẫu sẵn sàng xử lý",
          pages: payrollPages,
          cropAreas: [],
          columns: globalColumns.map((c) => ({ ...c, id: `col-pay-${c.key}` })),
          rows: [],
        },
      ];

      setFileQueue((prev) => [...prev, ...samples]);
      setSelectedFileId(samples[0].id);
      notify("success", "Đã nạp 3 tệp mẫu tiếng Việt để thử nghiệm hàng loạt");
    } catch (e: any) {
      notify("error", "Lỗi khi tạo tài liệu mẫu hàng loạt");
    }
  };

  // Remove single file from queue
  const handleRemoveFile = (id: string) => {
    setFileQueue((prev) => prev.filter((f) => f.id !== id));
    if (selectedFileId === id) {
      const remaining = fileQueue.filter((f) => f.id !== id);
      setSelectedFileId(remaining.length > 0 ? remaining[0].id : null);
    }
    if (editingFileModalItem?.id === id) {
      setEditingFileModalItem(null);
    }
  };

  // Clear all files
  const handleClearAll = () => {
    if (isProcessing) {
      handleStopProcessing();
    }
    setFileQueue([]);
    setSelectedFileId(null);
    setOverallProgress(0);
    setProcessingStatusText("");
    setIsWaitingSemiAutoReview(false);
    setEditingFileModalItem(null);
  };

  // Apply a Vietnamese preset to globalColumns
  const handleApplyPreset = (preset: VietnamesePreset) => {
    const newCols: ColumnDef[] = preset.columns.map((c, idx) => ({
      id: `col-bulk-${Date.now()}-${idx}`,
      name: c.name,
      key: c.key,
      type: c.type,
      description: c.description,
    }));
    setGlobalColumns(newCols);
    notify("success", `Đã áp dụng mẫu cột: ${preset.title}`);
  };

  // Stop processing immediately
  const handleStopProcessing = () => {
    isStopRequestedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setIsWaitingSemiAutoReview(false);
    setProcessingStatusText("Đã dừng tiến trình quét theo yêu cầu của bạn");
    notify("info", "Đã dừng tiến trình quét");
  };

  // Helper to load pages of a file item if not already loaded
  const ensureFilePagesLoaded = async (item: BulkFileItem): Promise<DocumentPage[]> => {
    if (item.pages && item.pages.length > 0) {
      return item.pages;
    }
    if (!item.file) {
      throw new Error(`Tệp ${item.fileName} không có dữ liệu nguồn`);
    }

    const file = item.file;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      return await loadPdfPages(file);
    } else {
      const page = await loadImagePage(file);
      return [page];
    }
  };

  // Auto-detect table bounding box for a page
  const detectTableBoxForPage = async (page: DocumentPage, abortSignal: AbortSignal) => {
    try {
      const box = await detectTableBoxAPI({
        imageBase64: page.imageUrl,
        mimeType: "image/png",
        signal: abortSignal,
      });

      if (box && box.ymin !== undefined && box.ymax !== undefined) {
        const xPercent = (box.xmin || 0) / 10;
        const yPercent = (box.ymin || 0) / 10;
        const wPercent = ((box.xmax || 1000) - (box.xmin || 0)) / 10;
        const hPercent = ((box.ymax || 1000) - (box.ymin || 0)) / 10;

        if (wPercent > 10 && hPercent > 8) {
          return {
            x: (xPercent / 100) * page.originalWidth,
            y: (yPercent / 100) * page.originalHeight,
            width: (wPercent / 100) * page.originalWidth,
            height: (hPercent / 100) * page.originalHeight,
          };
        }
      }
    } catch (e) {
      console.warn("Table box detection fallback:", e);
    }

    // Default safe fallback margin
    return {
      x: page.originalWidth * 0.05,
      y: page.originalHeight * 0.15,
      width: page.originalWidth * 0.9,
      height: page.originalHeight * 0.72,
    };
  };

  // Single File Extraction Core Routine (Used by both All-File Batch and Single-File buttons)
  const processSingleFileCore = async (
    targetFile: BulkFileItem,
    targetCols: ColumnDef[],
    abort: AbortController,
    optionsOverride?: { autoDetectColsFirst?: boolean }
  ): Promise<{ pages: DocumentPage[]; columns: ColumnDef[]; rows: TableRow[] }> => {
    // 1. Ensure pages are loaded
    const pages = await ensureFilePagesLoaded(targetFile);

    if (abort.signal.aborted || isStopRequestedRef.current) {
      throw new Error("Aborted");
    }

    // 2. Column Detection if requested
    let effectiveCols = targetCols;
    if (optionsOverride?.autoDetectColsFirst || targetCols.length === 0) {
      try {
        const firstPage = pages[0];
        const colData = await detectColumnsAPI({
          imageBase64: firstPage.imageUrl,
          mimeType: "image/png",
          signal: abort.signal,
        });

        if (
          colData.detectedColumns &&
          Array.isArray(colData.detectedColumns) &&
          colData.detectedColumns.length > 0
        ) {
          effectiveCols = colData.detectedColumns.map((c: any, cIdx: number) => ({
            id: `col-${targetFile.id}-${cIdx}`,
            name: c.name || `Cột ${cIdx + 1}`,
            key: c.key || `col${cIdx + 1}`,
            type: c.type || "text",
            description: c.sample ? `Mẫu: ${c.sample}` : undefined,
          }));
        }
      } catch (colErr) {
        console.warn("Single file column detection fallback:", colErr);
      }
    }

    if (abort.signal.aborted || isStopRequestedRef.current) {
      throw new Error("Aborted");
    }

    // 3. Scan Tables for all pages of this file
    const fileRows: TableRow[] = [];

    for (let pIdx = 0; pIdx < pages.length; pIdx++) {
      if (abort.signal.aborted || isStopRequestedRef.current) {
        throw new Error("Aborted");
      }

      const page = pages[pIdx];
      const cropBox = await detectTableBoxForPage(page, abort.signal);
      const croppedBase64 = await cropImageArea(
        page.imageUrl,
        cropBox,
        { width: page.originalWidth, height: page.originalHeight }
      );

      try {
        const ocrData = await extractTableAPI({
          imageBase64: croppedBase64,
          mimeType: "image/png",
          columns: effectiveCols,
          pageNumber: page.pageNumber,
          signal: abort.signal,
        });

        const extractedRows = ocrData.rows || [];
        extractedRows.forEach((r: any, rIdx: number) => {
          const rowObj: TableRow = {
            _id: `row-${targetFile.id}-p${page.pageNumber}-${rIdx}-${Date.now()}`,
            _pageNumber: page.pageNumber,
            _fileName: targetFile.fileName,
            _isModified: false,
          };
          effectiveCols.forEach((col) => {
            rowObj[col.key] = r[col.key] !== undefined && r[col.key] !== null ? String(r[col.key]) : "";
          });
          fileRows.push(rowObj);
        });
      } catch (scanErr) {
        console.error(`Error scanning page ${pIdx + 1} of ${targetFile.fileName}:`, scanErr);
      }
    }

    // 4. Duplicate Header Cleanup
    let finalRows = fileRows;
    if (options.removeDuplicateHeaders) {
      const cleaned = removeDuplicateHeaderRows(fileRows, effectiveCols);
      finalRows = cleaned.cleanRows;
    }

    return {
      pages,
      columns: effectiveCols,
      rows: finalRows,
    };
  };

  // ==========================================
  // ACTIONS FOR ALL FILES (BATCH MODES)
  // ==========================================

  // 1. 1-Click Auto for ALL Files (Opens popup window for merge and column mode verification)
  const handleStartFullAutoAll = () => {
    if (fileQueue.length === 0) {
      notify("info", "Vui lòng thêm ít nhất một tệp vào danh sách trước khi bắt đầu");
      return;
    }
    setBatchSetupModalMode("auto");
  };

  // 2. Semi-Auto for ALL Files (Opens popup window for merge and column mode verification)
  const handleStartSemiAutoAll = () => {
    if (fileQueue.length === 0) {
      notify("info", "Vui lòng thêm ít nhất một tệp vào danh sách trước khi bắt đầu");
      return;
    }
    setBatchSetupModalMode("semi-auto");
  };

  // 3. Manual Mode for ALL Files (Uses currently configured columns directly)
  const handleStartManualAll = () => {
    startBatchExecution("manual");
  };

  // =========================================================================
  // SEMI-AUTO GRANULAR WORKFLOW: Scan Columns file-by-file -> Confirm -> OCR All
  // =========================================================================

  // Start Semi-Auto scan column workflow
  const handleStartSemiAutoColumnScanWorkflow = () => {
    if (fileQueue.length === 0) {
      notify("info", "Vui lòng thêm tệp vào danh sách trước");
      return;
    }
    setBatchSetupModalMode(null);
    setAllColumnsConfiguredReady(false);
    scanColumnsForFileAtIndex(0);
  };

  // Scan columns for a specific file index in the queue, then open confirmation modal for that file
  const scanColumnsForFileAtIndex = async (index: number, queueSnapshot?: BulkFileItem[]) => {
    const queue = queueSnapshot || fileQueue;
    if (index >= queue.length) {
      setIsProcessing(false);
      setAllColumnsConfiguredReady(true);
      setCurrentProcessingFileId(null);
      setProcessingStatusText(`Đã hoàn tất cấu hình cột cho tất cả ${queue.length} tệp. Sẵn sàng bóc tách OCR.`);
      notify("success", `Đã xác nhận xong cấu trúc cột cho toàn bộ ${queue.length} tệp! Bấm nút bên dưới để bắt đầu quét OCR.`);
      return;
    }

    const currentFile = queue[index];
    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setCurrentProcessingFileId(currentFile.id);
    const fileNumberStr = `Tệp ${index + 1}/${queue.length}: ${currentFile.fileName}`;
    setProcessingStatusText(`Bán tự động: ${fileNumberStr} - Đang nạp trang và quét nhận diện cấu trúc cột`);

    // Mark current file as detecting
    setFileQueue((prev) =>
      prev.map((f, i) =>
        i === index
          ? { ...f, status: "detecting", progress: 25, statusMessage: "Đang nhận diện cấu trúc cột" }
          : f
      )
    );

    try {
      const pages = await ensureFilePagesLoaded(currentFile);
      if (abort.signal.aborted || isStopRequestedRef.current) return;

      const firstPage = pages[0];
      let detectedCols: ColumnDef[] = currentFile.columns.length > 0 ? currentFile.columns : globalColumns;

      // If sameColumns is true and user already configured previous file, reuse that default; otherwise AI detect
      if (options.sameColumns && index > 0 && globalColumns.length > 0) {
        detectedCols = globalColumns.map((c, cIdx) => ({
          ...c,
          id: `col-${currentFile.id}-${cIdx}`,
        }));
      } else {
        try {
          const colData = await detectColumnsAPI({
            imageBase64: firstPage.imageUrl,
            mimeType: "image/png",
            signal: abort.signal,
          });

          if (
            colData.detectedColumns &&
            Array.isArray(colData.detectedColumns) &&
            colData.detectedColumns.length > 0
          ) {
            detectedCols = colData.detectedColumns.map((c: any, cIdx: number) => ({
              id: `col-${currentFile.id}-${cIdx}`,
              name: c.name || `Cột ${cIdx + 1}`,
              key: c.key || `col${cIdx + 1}`,
              type: c.type || "text",
              description: c.sample ? `Mẫu: ${c.sample}` : undefined,
            }));
          }
        } catch (detectErr) {
          console.warn("Column detection fallback for file:", detectErr);
        }
      }

      if (abort.signal.aborted || isStopRequestedRef.current) return;

      // Update the file in queue
      const updatedQueue = queue.map((f, i) =>
        i === index
          ? {
              ...f,
              pages,
              columns: detectedCols,
              status: "queued" as const,
              progress: 35,
              statusMessage: `Đã nhận diện ${detectedCols.length} cột - Chờ xác nhận`,
            }
          : f
      );
      setFileQueue(updatedQueue);

      // Open the confirmation modal for this file
      setIsProcessing(false);
      setSemiAutoConfirmModalItem({
        fileId: currentFile.id,
        fileName: currentFile.fileName,
        fileIndex: index,
        totalFiles: queue.length,
        columns: detectedCols,
        pagePreviewUrl: firstPage?.imageUrl,
        totalPages: pages.length,
      });

      setProcessingStatusText(`Bán tự động: Chờ bạn xác nhận cấu trúc cột cho ${fileNumberStr}`);
    } catch (err: any) {
      if (err?.name === "AbortError" || abort.signal.aborted || isStopRequestedRef.current) {
        notify("info", "Đã dừng nhận diện cột");
        return;
      }
      setIsProcessing(false);
      notify("error", `Lỗi nhận diện cột cho "${currentFile.fileName}": ${err.message || String(err)}`);
    } finally {
      abortControllerRef.current = null;
    }
  };

  // Confirm column for the currently modal-opened file
  const handleConfirmColumnForCurrentFile = (applyToAllRemaining: boolean, startOcrImmediately: boolean = false) => {
    if (!semiAutoConfirmModalItem) return;

    const { fileIndex, totalFiles, columns: confirmedCols } = semiAutoConfirmModalItem;

    // 1. Update fileQueue with confirmed columns
    let updatedQueue: BulkFileItem[] = [];
    setFileQueue((prev) => {
      updatedQueue = prev.map((f, idx) => {
        if (idx === fileIndex) {
          return {
            ...f,
            columns: confirmedCols,
            statusMessage: `Đã xác nhận ${confirmedCols.length} cột`,
          };
        }
        if (applyToAllRemaining && idx > fileIndex) {
          return {
            ...f,
            columns: confirmedCols.map((c, cIdx) => ({
              ...c,
              id: `col-${f.id}-${cIdx}`,
            })),
            statusMessage: `Áp dụng ${confirmedCols.length} cột từ tệp ${fileIndex + 1}`,
          };
        }
        return f;
      });
      return updatedQueue;
    });

    // Also update globalColumns for reference
    setGlobalColumns(confirmedCols);

    // Close modal
    setSemiAutoConfirmModalItem(null);

    // 2. Next step
    if (applyToAllRemaining || fileIndex >= totalFiles - 1) {
      // Finished all files!
      setAllColumnsConfiguredReady(true);
      notify(
        "success",
        `Đã hoàn tất cấu hình cột cho tất cả ${totalFiles} tệp!`
      );
      if (startOcrImmediately) {
        handleRunBatchOCRAllFiles(updatedQueue);
      }
    } else {
      // Move to next file
      notify("info", `Đã lưu cột Tệp ${fileIndex + 1}/${totalFiles}. Bắt đầu nhận diện Tệp ${fileIndex + 2}`);
      setTimeout(() => {
        scanColumnsForFileAtIndex(fileIndex + 1, updatedQueue);
      }, 100);
    }
  };

  // Run Batch OCR for ALL Files using their confirmed columns
  const handleRunBatchOCRAllFiles = async (customQueue?: BulkFileItem[]) => {
    const queueToRun = customQueue || fileQueue;
    if (queueToRun.length === 0) {
      notify("info", "Không có tệp nào trong hàng đợi để quét OCR");
      return;
    }

    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setAllColumnsConfiguredReady(false);
    setProcessingStatusText(`Bắt đầu quét OCR toàn bộ ${queueToRun.length} tệp`);

    try {
      const totalFiles = queueToRun.length;

      for (let fileIdx = 0; fileIdx < totalFiles; fileIdx++) {
        if (abort.signal.aborted || isStopRequestedRef.current) break;

        const currentFile = queueToRun[fileIdx];
        setCurrentProcessingFileId(currentFile.id);
        const fileNumberStr = `Tệp ${fileIdx + 1}/${totalFiles}: ${currentFile.fileName}`;

        // Ensure pages
        let pages: DocumentPage[] = [];
        try {
          pages = await ensureFilePagesLoaded(currentFile);
        } catch (loadErr: any) {
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === currentFile.id
                ? {
                    ...f,
                    status: "error",
                    progress: 100,
                    errorMessage: loadErr.message || "Lỗi nạp tệp",
                    statusMessage: "Lỗi nạp tệp",
                  }
                : f
            )
          );
          continue;
        }

        const fileCols = currentFile.columns && currentFile.columns.length > 0 ? currentFile.columns : globalColumns;

        // Scan Tables for all pages of current file
        setProcessingStatusText(`${fileNumberStr} - Đang bóc tách OCR qua ${pages.length} trang`);
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === currentFile.id
              ? { ...f, status: "scanning", progress: 40, statusMessage: "Đang quét OCR bóc tách dữ liệu" }
              : f
          )
        );

        const fileRows: TableRow[] = [];

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          if (abort.signal.aborted || isStopRequestedRef.current) break;

          const page = pages[pIdx];
          setProcessingStatusText(`${fileNumberStr} - Quét OCR bảng trang ${pIdx + 1}/${pages.length}`);

          const cropBox = await detectTableBoxForPage(page, abort.signal);
          const croppedBase64 = await cropImageArea(
            page.imageUrl,
            cropBox,
            { width: page.originalWidth, height: page.originalHeight }
          );

          try {
            const ocrData = await extractTableAPI({
              imageBase64: croppedBase64,
              mimeType: "image/png",
              columns: fileCols,
              pageNumber: page.pageNumber,
              signal: abort.signal,
            });

            const extractedRows = ocrData.rows || [];
            extractedRows.forEach((r: any, rIdx: number) => {
              const rowObj: TableRow = {
                _id: `row-${currentFile.id}-p${page.pageNumber}-${rIdx}-${Date.now()}`,
                _pageNumber: page.pageNumber,
                _fileName: currentFile.fileName,
                _isModified: false,
              };
              fileCols.forEach((col) => {
                rowObj[col.key] = r[col.key] !== undefined && r[col.key] !== null ? String(r[col.key]) : "";
              });
              fileRows.push(rowObj);
            });
          } catch (scanErr) {
            console.error(`Error scanning page ${pIdx + 1} of ${currentFile.fileName}:`, scanErr);
          }

          const pageProgress = 40 + Math.round(((pIdx + 1) / pages.length) * 55);
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === currentFile.id
                ? {
                    ...f,
                    progress: pageProgress,
                    statusMessage: `Đang quét OCR trang ${pIdx + 1}/${pages.length}`,
                  }
                : f
            )
          );
        }

        // Header deduplication
        let finalRows = fileRows;
        let removedDupes = 0;
        if (options.removeDuplicateHeaders) {
          const cleaned = removeDuplicateHeaderRows(fileRows, fileCols);
          finalRows = cleaned.cleanRows;
          removedDupes = cleaned.removedCount;
        }

        // Mark completed
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === currentFile.id
              ? {
                  ...f,
                  pages,
                  columns: fileCols,
                  rows: finalRows,
                  status: "completed",
                  progress: 100,
                  statusMessage: `Hoàn tất (${finalRows.length} dòng${
                    removedDupes > 0 ? `, loại ${removedDupes} tiêu đề lặp` : ""
                  })`,
                }
              : f
          )
        );

        const overall = Math.round(((fileIdx + 1) / totalFiles) * 100);
        setOverallProgress(overall);
      }

      setProcessingStatusText("Đã hoàn tất bóc tách OCR tất cả các tệp thành công");
      notify("success", "Đã hoàn tất bóc tách OCR toàn bộ các tệp");
    } catch (err: any) {
      if (err?.name === "AbortError" || abort.signal.aborted || isStopRequestedRef.current) {
        notify("info", "Đã dừng tiến trình quét OCR");
        return;
      }
      console.error("Bulk OCR processing error:", err);
      notify("error", `Lỗi bóc tách OCR hàng loạt: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingFileId(null);
      abortControllerRef.current = null;
    }
  };

  // Generic Batch Processor Runner (For 1-Click Auto and Manual)
  const startBatchExecution = async (
    mode: "auto" | "semi-auto" | "manual",
    startIndex: number = 0,
    customCols?: ColumnDef[]
  ) => {
    if (mode === "semi-auto") {
      handleStartSemiAutoColumnScanWorkflow();
      return;
    }

    if (fileQueue.length === 0) {
      notify("info", "Vui lòng thêm ít nhất một tệp để bắt đầu");
      return;
    }

    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setIsWaitingSemiAutoReview(false);
    setProcessingStatusText("Bắt đầu xử lý hàng loạt các tệp");

    let activeCols = customCols || globalColumns;

    try {
      const totalFiles = fileQueue.length;

      for (let fileIdx = startIndex; fileIdx < totalFiles; fileIdx++) {
        if (abort.signal.aborted || isStopRequestedRef.current) break;

        const currentFile = fileQueue[fileIdx];
        setCurrentProcessingFileId(currentFile.id);
        const fileNumberStr = `Tệp ${fileIdx + 1}/${totalFiles}: ${currentFile.fileName}`;

        // 1. Load Pages
        setProcessingStatusText(`${fileNumberStr} - Đang nạp các trang tài liệu`);
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === currentFile.id
              ? { ...f, status: "loading", progress: 15, statusMessage: "Đang nạp các trang tài liệu" }
              : f
          )
        );

        let pages: DocumentPage[] = [];
        try {
          pages = await ensureFilePagesLoaded(currentFile);
        } catch (loadErr: any) {
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === currentFile.id
                ? {
                    ...f,
                    status: "error",
                    progress: 100,
                    errorMessage: loadErr.message || "Lỗi nạp tệp",
                    statusMessage: "Lỗi nạp tệp",
                  }
                : f
            )
          );
          continue;
        }

        if (abort.signal.aborted || isStopRequestedRef.current) break;

        // 2. Determine Columns
        let fileCols = activeCols;

        const shouldDetectThisFile = mode === "auto" && !options.sameColumns;

        if (shouldDetectThisFile) {
          setProcessingStatusText(`${fileNumberStr} - Đang quét cấu trúc và nhận diện cột`);
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === currentFile.id
                ? { ...f, status: "detecting", progress: 30, statusMessage: "Đang nhận diện cấu trúc cột" }
                : f
            )
          );

          try {
            const firstPage = pages[0];
            const colData = await detectColumnsAPI({
              imageBase64: firstPage.imageUrl,
              mimeType: "image/png",
              signal: abort.signal,
            });

            if (
              colData.detectedColumns &&
              Array.isArray(colData.detectedColumns) &&
              colData.detectedColumns.length > 0
            ) {
              fileCols = colData.detectedColumns.map((c: any, cIdx: number) => ({
                id: `col-${currentFile.id}-${cIdx}`,
                name: c.name || `Cột ${cIdx + 1}`,
                key: c.key || `col${cIdx + 1}`,
                type: c.type || "text",
                description: c.sample ? `Mẫu: ${c.sample}` : undefined,
              }));
            }
          } catch (colErr) {
            console.warn("Column detection fallback:", colErr);
          }
        }

        if (abort.signal.aborted || isStopRequestedRef.current) break;

        // 3. Scan Tables for all pages of current file
        setProcessingStatusText(`${fileNumberStr} - Đang bóc tách OCR qua ${pages.length} trang`);
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === currentFile.id
              ? { ...f, status: "scanning", progress: 45, statusMessage: "Đang quét OCR bóc tách dữ liệu" }
              : f
          )
        );

        const fileRows: TableRow[] = [];

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          if (abort.signal.aborted || isStopRequestedRef.current) break;

          const page = pages[pIdx];
          setProcessingStatusText(`${fileNumberStr} - Quét OCR trang ${pIdx + 1}/${pages.length}`);

          const cropBox = await detectTableBoxForPage(page, abort.signal);
          const croppedBase64 = await cropImageArea(
            page.imageUrl,
            cropBox,
            { width: page.originalWidth, height: page.originalHeight }
          );

          try {
            const ocrData = await extractTableAPI({
              imageBase64: croppedBase64,
              mimeType: "image/png",
              columns: fileCols,
              pageNumber: page.pageNumber,
              signal: abort.signal,
            });

            const extractedRows = ocrData.rows || [];
            extractedRows.forEach((r: any, rIdx: number) => {
              const rowObj: TableRow = {
                _id: `row-${currentFile.id}-p${page.pageNumber}-${rIdx}-${Date.now()}`,
                _pageNumber: page.pageNumber,
                _fileName: currentFile.fileName,
                _isModified: false,
              };
              fileCols.forEach((col) => {
                rowObj[col.key] = r[col.key] !== undefined && r[col.key] !== null ? String(r[col.key]) : "";
              });
              fileRows.push(rowObj);
            });
          } catch (scanErr) {
            console.error(`Error scanning page ${pIdx + 1} of ${currentFile.fileName}:`, scanErr);
          }

          // Update per-file progress
          const pageProgress = 45 + Math.round(((pIdx + 1) / pages.length) * 45);
          setFileQueue((prev) =>
            prev.map((f) =>
              f.id === currentFile.id
                ? {
                    ...f,
                    progress: pageProgress,
                    statusMessage: `Đang quét OCR trang ${pIdx + 1}/${pages.length}`,
                  }
                : f
            )
          );
        }

        // 4. Header deduplication
        let finalRows = fileRows;
        let removedDupes = 0;
        if (options.removeDuplicateHeaders) {
          const cleaned = removeDuplicateHeaderRows(fileRows, fileCols);
          finalRows = cleaned.cleanRows;
          removedDupes = cleaned.removedCount;
        }

        // Mark file completed
        setFileQueue((prev) =>
          prev.map((f) =>
            f.id === currentFile.id
              ? {
                  ...f,
                  pages,
                  columns: fileCols,
                  rows: finalRows,
                  status: "completed",
                  progress: 100,
                  statusMessage: `Hoàn tất (${finalRows.length} dòng${
                    removedDupes > 0 ? `, loại ${removedDupes} tiêu đề lặp` : ""
                  })`,
                }
              : f
          )
        );

        // Update overall progress
        const overall = Math.round(((fileIdx + 1) / totalFiles) * 100);
        setOverallProgress(overall);
      }

      setProcessingStatusText("Đã hoàn tất xử lý tất cả các tệp thành công");
      notify("success", "Đã hoàn tất tiến trình bóc tách OCR hàng loạt");
    } catch (err: any) {
      if (err?.name === "AbortError" || abort.signal.aborted || isStopRequestedRef.current) {
        notify("info", "Đã dừng tiến trình quét hàng loạt");
        return;
      }
      console.error("Bulk processing error:", err);
      notify("error", `Lỗi tiến trình hàng loạt: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingFileId(null);
      abortControllerRef.current = null;
    }
  };

  // Resume processing after semi-auto checkpoint
  const handleResumeSemiAuto = () => {
    setIsWaitingSemiAutoReview(false);
    startBatchExecution("manual", 0, globalColumns);
  };

  // ==========================================
  // ACTIONS FOR INDIVIDUAL FILES (EACH FILE)
  // ==========================================

  // 1. 1-Click Auto for a specific single file
  const handleRunAutoForSingleFile = async (fileId: string) => {
    const targetFile = fileQueue.find((f) => f.id === fileId);
    if (!targetFile) return;

    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setCurrentProcessingFileId(fileId);
    setProcessingStatusText(`Bắt đầu quét tự động tệp "${targetFile.fileName}"`);

    // Mark file as loading
    setFileQueue((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: "loading", progress: 20, statusMessage: "Đang nạp các trang tài liệu" }
          : f
      )
    );

    try {
      const colsToUse = options.sameColumns ? globalColumns : (targetFile.columns.length > 0 ? targetFile.columns : globalColumns);
      const result = await processSingleFileCore(targetFile, colsToUse, abort, {
        autoDetectColsFirst: !options.sameColumns,
      });

      setFileQueue((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                pages: result.pages,
                columns: result.columns,
                rows: result.rows,
                status: "completed",
                progress: 100,
                statusMessage: `Hoàn tất (${result.rows.length} dòng trích xuất)`,
              }
            : f
        )
      );

      setSelectedFileId(fileId);
      setProcessingStatusText(`Hoàn tất quét tệp "${targetFile.fileName}"`);
      notify("success", `Đã trích xuất thành công ${result.rows.length} dòng từ "${targetFile.fileName}"`);
    } catch (err: any) {
      if (err?.name === "AbortError" || abort.signal.aborted || isStopRequestedRef.current) {
        notify("info", `Đã dừng quét tệp "${targetFile.fileName}"`);
        return;
      }
      setFileQueue((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                status: "error",
                progress: 100,
                errorMessage: err.message || "Lỗi quét tệp",
                statusMessage: "Lỗi quét tệp",
              }
            : f
        )
      );
      notify("error", `Lỗi khi quét "${targetFile.fileName}": ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingFileId(null);
      abortControllerRef.current = null;
    }
  };

  // 2. Semi-Auto for a specific single file (Auto-detects columns for this file and opens column review editor)
  const handleRunSemiAutoForSingleFile = async (fileId: string) => {
    const targetFile = fileQueue.find((f) => f.id === fileId);
    if (!targetFile) return;

    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setCurrentProcessingFileId(fileId);
    setProcessingStatusText(`Bán tự động: Đang quét nhận diện cấu trúc cột cho "${targetFile.fileName}"`);

    setFileQueue((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, status: "detecting", progress: 30, statusMessage: "Đang nhận diện cấu trúc cột" }
          : f
      )
    );

    try {
      const pages = await ensureFilePagesLoaded(targetFile);
      const firstPage = pages[0];

      let detectedCols = targetFile.columns.length > 0 ? targetFile.columns : globalColumns;

      const colData = await detectColumnsAPI({
        imageBase64: firstPage.imageUrl,
        mimeType: "image/png",
        signal: abort.signal,
      });

      if (
        colData.detectedColumns &&
        Array.isArray(colData.detectedColumns) &&
        colData.detectedColumns.length > 0
      ) {
        detectedCols = colData.detectedColumns.map((c: any, cIdx: number) => ({
          id: `col-${targetFile.id}-${cIdx}`,
          name: c.name || `Cột ${cIdx + 1}`,
          key: c.key || `col${cIdx + 1}`,
          type: c.type || "text",
          description: c.sample ? `Mẫu: ${c.sample}` : undefined,
        }));
      }

      const updatedFileItem: BulkFileItem = {
        ...targetFile,
        pages,
        columns: detectedCols,
        status: "queued",
        progress: 40,
        statusMessage: `Đã nhận diện ${detectedCols.length} cột - Vui lòng kiểm tra`,
      };

      setFileQueue((prev) => prev.map((f) => (f.id === fileId ? updatedFileItem : f)));
      setSelectedFileId(fileId);
      // Open modal for column review!
      setEditingFileModalItem(updatedFileItem);

      setProcessingStatusText(`Đã nhận diện ${detectedCols.length} cột từ "${targetFile.fileName}". Mở bảng hiệu chỉnh cột.`);
      notify("info", `Đã nhận diện ${detectedCols.length} cột. Bạn có thể kiểm tra và bấm Quét dữ liệu.`);
    } catch (err: any) {
      notify("error", `Lỗi khi nhận diện cột: ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingFileId(null);
      abortControllerRef.current = null;
    }
  };

  // 3. Manual / Edit Columns for a specific single file
  const handleOpenManualEditForFile = async (fileId: string) => {
    const targetFile = fileQueue.find((f) => f.id === fileId);
    if (!targetFile) return;

    try {
      const pages = await ensureFilePagesLoaded(targetFile);
      const updatedItem = {
        ...targetFile,
        pages,
        columns: targetFile.columns.length > 0 ? targetFile.columns : [...globalColumns],
      };
      setFileQueue((prev) => prev.map((f) => (f.id === fileId ? updatedItem : f)));
      setSelectedFileId(fileId);
      setEditingFileModalItem(updatedItem);
    } catch (e: any) {
      notify("error", `Không thể nạp tệp: ${e.message || String(e)}`);
    }
  };

  // Trigger scan from inside the Edit File Modal
  const handleScanFromModal = async () => {
    if (!editingFileModalItem) return;
    const fileId = editingFileModalItem.id;
    const currentItem = editingFileModalItem;
    setEditingFileModalItem(null);

    isStopRequestedRef.current = false;
    const abort = new AbortController();
    abortControllerRef.current = abort;
    setIsProcessing(true);
    setCurrentProcessingFileId(fileId);
    setProcessingStatusText(`Đang quét OCR tệp "${currentItem.fileName}" theo mẫu cột đã chỉnh sửa`);

    try {
      const result = await processSingleFileCore(currentItem, currentItem.columns, abort);
      setFileQueue((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? {
                ...f,
                pages: result.pages,
                columns: result.columns,
                rows: result.rows,
                status: "completed",
                progress: 100,
                statusMessage: `Hoàn tất (${result.rows.length} dòng trích xuất)`,
              }
            : f
        )
      );
      setSelectedFileId(fileId);
      setProcessingStatusText(`Hoàn tất quét tệp "${currentItem.fileName}"`);
      notify("success", `Đã trích xuất thành công ${result.rows.length} dòng từ "${currentItem.fileName}"`);
    } catch (err: any) {
      if (err?.name === "AbortError" || abort.signal.aborted || isStopRequestedRef.current) {
        notify("info", `Đã dừng quét tệp "${currentItem.fileName}"`);
        return;
      }
      notify("error", `Lỗi khi quét "${currentItem.fileName}": ${err.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setCurrentProcessingFileId(null);
      abortControllerRef.current = null;
    }
  };

  // Consolidate all rows when mergeFiles is true
  const mergedData = React.useMemo(() => {
    let effectiveCols: ColumnDef[] = [];

    if (options.sameColumns) {
      effectiveCols = [...globalColumns];
    } else {
      const colMap = new Map<string, ColumnDef>();
      fileQueue.forEach((f) => {
        if (f.columns && f.columns.length > 0) {
          f.columns.forEach((c) => {
            if (!colMap.has(c.key)) {
              colMap.set(c.key, c);
            }
          });
        }
      });
      effectiveCols = Array.from(colMap.values());
      if (effectiveCols.length === 0) {
        effectiveCols = [...globalColumns];
      }
    }

    // Prepend or append file name column if enabled
    if (options.includeFileNameColumn && !effectiveCols.some((c) => c.key === "_fileName")) {
      effectiveCols = [
        { id: "col-file-name", name: "Tên tệp gốc", key: "_fileName", type: "text" },
        ...effectiveCols,
      ];
    }

    const allRows: TableRow[] = [];
    fileQueue.forEach((f) => {
      if (f.rows && f.rows.length > 0) {
        f.rows.forEach((r) => {
          allRows.push({
            ...r,
            _fileName: r._fileName || f.fileName,
          });
        });
      }
    });

    return { columns: effectiveCols, rows: allRows };
  }, [fileQueue, globalColumns, options.sameColumns, options.includeFileNameColumn]);

  // Active file for separated inspection when mergeFiles is false
  const activeFile = fileQueue.find((f) => f.id === selectedFileId) || fileQueue[0] || null;

  // Export handlers
  const handleExportMergedExcel = () => {
    if (mergedData.rows.length === 0) {
      notify("info", "Chưa có dữ liệu nào để xuất");
      return;
    }
    const fname = bulkExportFilename.trim() || "tong_hop_ocr_hang_loat";
    exportToExcel(mergedData.columns, mergedData.rows, `${fname}.xlsx`);
    notify("success", `Đã tải về file Excel tổng hợp: ${fname}.xlsx`);
  };

  const handleExportMergedCSV = () => {
    if (mergedData.rows.length === 0) {
      notify("info", "Chưa có dữ liệu nào để xuất");
      return;
    }
    const fname = bulkExportFilename.trim() || "tong_hop_ocr_hang_loat";
    exportToCSV(mergedData.columns, mergedData.rows, `${fname}.csv`);
    notify("success", `Đã tải về file CSV: ${fname}.csv`);
  };

  const handleExportMultiSheetExcel = () => {
    const completedFiles = fileQueue.filter((f) => f.rows && f.rows.length > 0);
    if (completedFiles.length === 0) {
      notify("info", "Chưa có tệp nào hoàn tất trích xuất dữ liệu");
      return;
    }

    const fileResults = completedFiles.map((f) => ({
      fileName: f.fileName,
      sheetName: f.fileName.replace(/\.[^/.]+$/, "").slice(0, 25),
      columns: f.columns && f.columns.length > 0 ? f.columns : globalColumns,
      rows: f.rows || [],
    }));

    const fname = bulkExportFilename.trim() || "bang_tinh_da_sheet";
    exportMultiSheetExcel(fileResults, `${fname}.xlsx`);
    notify("success", `Đã xuất ${completedFiles.length} tệp thành các Sheet riêng trong file Excel`);
  };

  const handleExportZip = (format: "xlsx" | "csv") => {
    const completedFiles = fileQueue.filter((f) => f.rows && f.rows.length > 0);
    if (completedFiles.length === 0) {
      notify("info", "Chưa có tệp nào hoàn tất trích xuất dữ liệu");
      return;
    }

    const fileResults = completedFiles.map((f) => ({
      fileName: f.fileName,
      columns: f.columns && f.columns.length > 0 ? f.columns : globalColumns,
      rows: f.rows || [],
    }));

    const fname = bulkExportFilename.trim() || "ket_qua_ocr_hang_loat";
    exportZipFiles(fileResults, `${fname}.zip`, format);
    notify("success", `Đã tạo file nén ZIP chứa ${completedFiles.length} file ${format.toUpperCase()} riêng biệt`);
  };

  // Total statistics
  const completedCount = fileQueue.filter((f) => f.status === "completed").length;
  const totalRowsCount = fileQueue.reduce((acc, f) => acc + (f.rows?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Multi-file Upload Drop Area */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <Files className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-slate-800">
                Xử lý nhiều tệp &amp; Hàng loạt (Bulk Multi-File OCR)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Hỗ trợ cả 3 chế độ: <strong>Tự động 1-chạm</strong>, <strong>Bán tự động (dừng xem &amp; chỉnh sửa cột)</strong>, và <strong>Thủ công từng bước</strong> cho toàn bộ hoặc từng tệp.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleLoadSampleBatch}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
              title="Tải ngay 3 file mẫu chuẩn tiếng Việt để thử nghiệm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Nạp 3 tệp mẫu thử nghiệm</span>
            </button>

            {fileQueue.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa danh sách ({fileQueue.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Drag & Drop Multi-file Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files) {
              handleFilesSelected(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-slate-50/60 hover:bg-indigo-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[130px]"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
            onChange={(e) => {
              if (e.target.files) {
                handleFilesSelected(e.target.files);
              }
            }}
            className="hidden"
          />

          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-2.5 shadow-2xs">
            <Upload className="w-6 h-6" />
          </div>

          <p className="text-sm font-bold text-slate-800">
            Kéo thả nhiều file PDF / Ảnh vào đây hoặc nhấp để chọn
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Hỗ trợ chọn cùng lúc nhiều tệp PDF đa trang, PNG, JPG, WebP (không giới hạn số lượng tệp)
          </p>
        </div>

        {/* Processing Options Grid - Configured BEFORE Auto Buttons */}
        <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Tùy chọn cấu hình &amp; Cột dữ liệu (Thiết lập trước khi quét)
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Bạn có thể điều chỉnh tại đây hoặc chỉnh trong cửa sổ bật lên khi bấm nút chạy
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Option 1: Merge files or not */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  {options.mergeFiles ? (
                    <Merge className="w-4 h-4 text-indigo-600" />
                  ) : (
                    <Split className="w-4 h-4 text-slate-600" />
                  )}
                  <span>1. Chế độ gộp dữ liệu (Merge Files)</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    options.mergeFiles ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {options.mergeFiles ? "Gộp chung 1 bảng" : "Giữ riêng từng tệp"}
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="mergeFilesOption"
                    checked={options.mergeFiles}
                    onChange={() => setOptions((prev) => ({ ...prev, mergeFiles: true }))}
                    className="text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    Gộp tất cả tệp vào 1 bảng Excel duy nhất
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5">
                  Tất cả các dòng trích xuất được gom thành một danh sách lớn để phân tích tổng hợp.
                </p>

                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none pt-1">
                  <input
                    type="radio"
                    name="mergeFilesOption"
                    checked={!options.mergeFiles}
                    onChange={() => setOptions((prev) => ({ ...prev, mergeFiles: false }))}
                    className="text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    Giữ riêng từng tệp (Xuất Excel đa Sheet hoặc ZIP)
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5">
                  Mỗi file giữ cấu trúc độc lập (cho phép xuất 1 file Excel nhiều sheet hoặc tải tệp ZIP).
                </p>
              </div>

              {options.mergeFiles && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={options.includeFileNameColumn}
                      onChange={(e) =>
                        setOptions((prev) => ({ ...prev, includeFileNameColumn: e.target.checked }))
                      }
                      className="text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-[11px] font-medium text-slate-700">
                      Tự động thêm cột <strong>"Tên tệp gốc"</strong> để phân loại dòng dữ liệu
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Option 2: Same columns or not */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>2. Cấu trúc cột dữ liệu (Columns)</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    options.sameColumns ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {options.sameColumns ? "Cùng cấu trúc cột" : "Tự động từng tệp"}
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                  <input
                    type="radio"
                    name="sameColumnsOption"
                    checked={options.sameColumns}
                    onChange={() => setOptions((prev) => ({ ...prev, sameColumns: true }))}
                    className="text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    Áp dụng cùng 1 mẫu cột cho tất cả các tệp
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5">
                  Phù hợp khi bạn quét nhiều hóa đơn/phiếu có chung cấu trúc bảng biểu.
                </p>

                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none pt-1">
                  <input
                    type="radio"
                    name="sameColumnsOption"
                    checked={!options.sameColumns}
                    onChange={() => setOptions((prev) => ({ ...prev, sameColumns: false }))}
                    className="text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <span className="font-semibold text-slate-800">
                    AI tự động nhận diện cột riêng cho từng tệp
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-5">
                  Phù hợp khi danh sách tải lên gồm nhiều loại tài liệu khác nhau.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <label className="flex items-center gap-2 text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={options.removeDuplicateHeaders}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, removeDuplicateHeaders: e.target.checked }))
                    }
                    className="text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-[11px] font-medium text-slate-700">
                    Tự động loại bỏ dòng tiêu đề bị lặp lại giữa các trang và tệp
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Unified Column Preset Selector (When sameColumns is true) */}
          {options.sameColumns && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-800">
                    Mẫu cột áp dụng chung ({globalColumns.length} cột):
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {globalColumns.map((col) => (
                      <span
                        key={col.id}
                        className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md text-[11px] font-medium text-slate-700"
                      >
                        {col.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">Chọn mẫu nhanh:</span>
                  {VIETNAMESE_PRESETS.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      {p.title.split("(")[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3 Global Batch Mode Cards */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <span>Chế độ chạy cho TOÀN BỘ danh sách ({fileQueue.length} tệp)</span>
            </span>
            {isProcessing && (
              <span className="text-xs text-indigo-600 font-bold animate-pulse flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Mode 1: 1-Click Auto All */}
            <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-100/40 border border-indigo-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
                    <Zap className="w-4 h-4 fill-white" />
                  </div>
                  <span>1. Tự động 1-Chạm (Auto All)</span>
                </div>
                <p className="text-[11px] text-indigo-900/80 mt-1.5 leading-relaxed">
                  Tự động nhận diện cấu trúc cột, khoanh vùng bảng và quét OCR toàn bộ các tệp liên tục từ đầu đến cuối mà không dừng lại.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartFullAutoAll}
                disabled={fileQueue.length === 0 || isProcessing}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Chạy Tự động Toàn bộ</span>
              </button>
            </div>

            {/* Mode 2: Semi-Auto All */}
            <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/40 border border-amber-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-amber-500 text-white">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <span>2. Bán tự động (Semi-Auto All)</span>
                </div>
                <p className="text-[11px] text-amber-900/80 mt-1.5 leading-relaxed">
                  Tự động quét nhận diện cấu trúc cột từng tệp, <strong>hiện bảng xác nhận cho từng tệp</strong>, sau đó bạn bấm quét OCR toàn bộ.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartSemiAutoAll}
                disabled={fileQueue.length === 0 || isProcessing}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs text-amber-950 bg-amber-300 hover:bg-amber-400 shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Chạy Bán tự động</span>
              </button>
            </div>

            {/* Mode 3: Manual Step-by-Step */}
            <div className="bg-gradient-to-br from-slate-50 to-slate-100/80 border border-slate-200 rounded-2xl p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
              <div>
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                  <div className="p-1.5 rounded-lg bg-slate-700 text-white">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <span>3. Thủ công (Manual All)</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                  Áp dụng mẫu cột sẵn có hoặc tự định nghĩa cột chung ở phần tùy chọn bên trên, sau đó quét theo cấu trúc đã chọn.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStartManualAll}
                disabled={fileQueue.length === 0 || isProcessing}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs text-slate-800 bg-white hover:bg-slate-200 border border-slate-300 shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-slate-700" />
                <span>Quét với Mẫu cột hiện tại</span>
              </button>
            </div>
          </div>

          {/* Sẵn sàng Quét OCR Toàn Bộ Banner (Appears after Semi-Auto column scan sequence finishes) */}
          {allColumnsConfiguredReady && !isProcessing && (
            <div className="bg-gradient-to-r from-emerald-500 via-teal-600 to-indigo-600 text-white rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-3.5 text-center sm:text-left">
                <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-xs flex-shrink-0">
                  <CheckCircle2 className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-extrabold tracking-tight">
                    Đã hoàn tất cấu hình cột cho tất cả {fileQueue.length} tệp!
                  </h4>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    Cấu trúc các cột đã được xác nhận sẵn sàng. Hãy bấm nút để tiến hành bóc tách OCR toàn bộ dữ liệu.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleRunBatchOCRAllFiles()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-extrabold text-sm text-emerald-950 bg-white hover:bg-emerald-50 shadow-md transition-all cursor-pointer hover:scale-105 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-emerald-950 text-emerald-950" />
                  <span>Bắt đầu Quét OCR Toàn Bộ ({fileQueue.length} tệp)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* File Queue List with Per-File 1-Click Auto, Semi-Auto, Manual Controls */}
        {fileQueue.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600 font-bold uppercase tracking-wider">
              <span>Danh sách tệp &amp; Thao tác từng tệp ({fileQueue.length} tệp)</span>
              <span className="text-indigo-600 font-mono">
                Đã hoàn tất: {completedCount}/{fileQueue.length} tệp • Tổng {totalRowsCount} dòng
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
              {fileQueue.map((item, idx) => {
                const isSelected = selectedFileId === item.id;
                const isCurrentlyActive = currentProcessingFileId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 sm:px-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs transition-colors ${
                      isSelected ? "bg-indigo-50/50" : "hover:bg-slate-50/80"
                    } ${isCurrentlyActive ? "ring-2 ring-indigo-500 ring-inset bg-indigo-50/70" : ""}`}
                  >
                    {/* Left: File metadata */}
                    <div
                      onClick={() => setSelectedFileId(item.id)}
                      className="flex items-start gap-3 min-w-0 cursor-pointer flex-1"
                    >
                      <span className="font-mono text-slate-400 font-bold w-5 text-center flex-shrink-0 mt-1">
                        {idx + 1}
                      </span>

                      <div className="p-2 rounded-xl bg-slate-100 text-slate-600 flex-shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-indigo-600" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        {/* File Name (Full untruncated display) */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 break-all">{item.fileName}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {(item.fileSize / 1024).toFixed(0)} KB
                          </span>
                          {item.pages.length > 0 && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              • {item.pages.length} trang
                            </span>
                          )}
                          {item.rows && item.rows.length > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-full border border-emerald-200">
                              {item.rows.length} dòng
                            </span>
                          )}
                        </div>

                        {/* Status Message (Full untruncated text) */}
                        <div className="text-[11px] text-slate-600 leading-snug break-words">
                          {item.status === "completed" && (
                            <span className="text-emerald-700 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>{item.statusMessage}</span>
                            </span>
                          )}
                          {item.status === "scanning" && (
                            <span className="text-amber-700 font-medium flex items-center gap-1 animate-pulse">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 flex-shrink-0" />
                              <span>{item.statusMessage}</span>
                            </span>
                          )}
                          {item.status === "detecting" && (
                            <span className="text-purple-700 font-medium flex items-center gap-1">
                              <Sparkles className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
                              <span>{item.statusMessage}</span>
                            </span>
                          )}
                          {item.status === "loading" && (
                            <span className="text-indigo-700 font-medium flex items-center gap-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 flex-shrink-0" />
                              <span>{item.statusMessage}</span>
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="text-red-700 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                              <span>{item.statusMessage}</span>
                            </span>
                          )}
                          {item.status === "queued" && (
                            <span className="text-slate-500 font-medium">
                              {item.statusMessage}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Individual Action Buttons for THIS file */}
                    <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                      {/* 1-Click Auto for this file */}
                      <button
                        type="button"
                        onClick={() => handleRunAutoForSingleFile(item.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                        title="Tự động 1-chạm: Quét trọn gói cho riêng tệp này"
                      >
                        <Zap className="w-3 h-3 fill-indigo-600 text-indigo-600" />
                        <span>Tự động</span>
                      </button>

                      {/* Semi-Auto for this file */}
                      <button
                        type="button"
                        onClick={() => handleRunSemiAutoForSingleFile(item.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                        title="Bán tự động: Quét nhận diện cột tệp này và mở bảng xem & chỉnh sửa"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Bán tự động</span>
                      </button>

                      {/* Manual / Edit Columns for this file */}
                      <button
                        type="button"
                        onClick={() => handleOpenManualEditForFile(item.id)}
                        disabled={isProcessing}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                        title="Thủ công: Mở xem trước các trang, chỉnh sửa danh sách cột riêng và quét"
                      >
                        <Edit3 className="w-3 h-3 text-slate-600" />
                        <span>Sửa cột</span>
                      </button>

                      {/* Re-scan button if completed */}
                      {item.status === "completed" && (
                        <button
                          type="button"
                          onClick={() => handleRunAutoForSingleFile(item.id)}
                          disabled={isProcessing}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Quét lại tệp này"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Delete File Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.id)}
                        disabled={isProcessing}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer disabled:opacity-30"
                        title="Xóa tệp này khỏi danh sách"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Batch Setup & Confirmation Modal for 1-Click Auto / Semi-Auto */}
      {batchSetupModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl space-y-4 p-5 sm:p-6 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-2xl ${
                    batchSetupModalMode === "auto"
                      ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
                      : "bg-amber-50 text-amber-600 border border-amber-100"
                  }`}
                >
                  {batchSetupModalMode === "auto" ? (
                    <Zap className="w-6 h-6 fill-indigo-600 text-indigo-600" />
                  ) : (
                    <Sliders className="w-6 h-6 text-amber-600" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800">
                      {batchSetupModalMode === "auto"
                        ? "Cấu hình Quét Tự động 1-Chạm"
                        : "Cấu hình Quét Bán tự động"}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                      {fileQueue.length} tệp trong hàng đợi
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {batchSetupModalMode === "auto"
                      ? "Kiểm tra chế độ gộp dữ liệu và cấu trúc cột trước khi AI tự động quét liên tục toàn bộ danh sách."
                      : "AI sẽ quét nhận diện cột từ tệp đầu tiên, tạm dừng để bạn kiểm tra/sửa cột rồi mới tiếp tục quét toàn bộ."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBatchSetupModalMode(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Options selection */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Section 1: Merge Files Mode */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Merge className="w-4 h-4 text-indigo-600" />
                    <span>1. Chế độ gộp dữ liệu (Merge Files)</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      options.mergeFiles ? "bg-indigo-100 text-indigo-700" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {options.mergeFiles ? "Gộp chung 1 bảng" : "Giữ riêng từng tệp"}
                  </span>
                </div>

                <div className="space-y-2">
                  <div
                    onClick={() => setOptions((prev) => ({ ...prev, mergeFiles: true }))}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      options.mergeFiles
                        ? "bg-white border-indigo-400 ring-2 ring-indigo-100 shadow-2xs"
                        : "bg-white/60 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalMergeOption"
                      checked={options.mergeFiles}
                      onChange={() => setOptions((prev) => ({ ...prev, mergeFiles: true }))}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <div className="space-y-0.5 flex-1">
                      <span className="font-bold text-xs text-slate-800 block">
                        Gộp tất cả {fileQueue.length} tệp vào 1 bảng Excel duy nhất
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Tất cả các dòng trích xuất từ tất cả tệp sẽ được gom chung thành một bảng tổng hợp.
                      </span>
                      {options.mergeFiles && (
                        <div className="pt-2 mt-1 border-t border-slate-100">
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-slate-700 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={options.includeFileNameColumn}
                              onChange={(e) =>
                                setOptions((prev) => ({ ...prev, includeFileNameColumn: e.target.checked }))
                              }
                              className="text-indigo-600 rounded focus:ring-indigo-500"
                            />
                            <span className="text-[11px] font-semibold text-slate-700">
                              Tự động thêm cột <strong>"Tên tệp gốc"</strong> để phân loại dòng dữ liệu
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => setOptions((prev) => ({ ...prev, mergeFiles: false }))}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      !options.mergeFiles
                        ? "bg-white border-indigo-400 ring-2 ring-indigo-100 shadow-2xs"
                        : "bg-white/60 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalMergeOption"
                      checked={!options.mergeFiles}
                      onChange={() => setOptions((prev) => ({ ...prev, mergeFiles: false }))}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <div className="space-y-0.5 flex-1">
                      <span className="font-bold text-xs text-slate-800 block">
                        Giữ riêng từng tệp (Xuất Excel nhiều Sheet hoặc tệp ZIP)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Mỗi file dữ liệu độc lập, cho phép xuất 1 file Excel nhiều sheet hoặc tải tệp ZIP chứa từng file.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Column Structure Mode */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-indigo-600" />
                    <span>2. Cấu trúc cột dữ liệu (Column Mode)</span>
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      options.sameColumns ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {options.sameColumns ? "Cùng mẫu cột" : "Nhận diện riêng từng tệp"}
                  </span>
                </div>

                <div className="space-y-2">
                  <div
                    onClick={() => setOptions((prev) => ({ ...prev, sameColumns: true }))}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      options.sameColumns
                        ? "bg-white border-indigo-400 ring-2 ring-indigo-100 shadow-2xs"
                        : "bg-white/60 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalSameColumnsOption"
                      checked={options.sameColumns}
                      onChange={() => setOptions((prev) => ({ ...prev, sameColumns: true }))}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <div className="space-y-1.5 flex-1">
                      <span className="font-bold text-xs text-slate-800 block">
                        Áp dụng cùng 1 mẫu cột cho tất cả các tệp (Khuyên dùng khi quét hóa đơn/phiếu tương đồng)
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Tất cả các tệp sẽ được trích xuất đồng bộ theo cấu trúc cột định sẵn.
                      </span>

                      {options.sameColumns && (
                        <div className="pt-2 border-t border-slate-100 space-y-2">
                          <div className="flex items-center justify-between gap-1 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-600">
                              Mẫu cột hiện tại ({globalColumns.length} cột):
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-slate-400">Chọn mẫu nhanh:</span>
                              {VIETNAMESE_PRESETS.slice(0, 3).map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleApplyPreset(p);
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-bold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                                >
                                  {p.title.split("(")[0]}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {globalColumns.map((col, idx) => (
                              <span
                                key={col.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50/70 border border-indigo-200 rounded-md text-[11px] font-semibold text-indigo-900"
                              >
                                <span className="text-[10px] text-indigo-500 font-mono">#{idx + 1}</span>
                                <span>{col.name}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => setOptions((prev) => ({ ...prev, sameColumns: false }))}
                    className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      !options.sameColumns
                        ? "bg-white border-indigo-400 ring-2 ring-indigo-100 shadow-2xs"
                        : "bg-white/60 border-slate-200 hover:bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="modalSameColumnsOption"
                      checked={!options.sameColumns}
                      onChange={() => setOptions((prev) => ({ ...prev, sameColumns: false }))}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
                    />
                    <div className="space-y-0.5 flex-1">
                      <span className="font-bold text-xs text-slate-800 block">
                        AI tự động nhận diện cấu trúc cột riêng cho từng tệp
                      </span>
                      <span className="text-[11px] text-slate-500 block">
                        Mỗi tệp sẽ được AI quét nhận diện cấu trúc tiêu đề riêng biệt (thích hợp cho tệp hỗn hợp nhiều dạng).
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Extra Filtering */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <label className="flex items-center gap-2.5 text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={options.removeDuplicateHeaders}
                    onChange={(e) =>
                      setOptions((prev) => ({ ...prev, removeDuplicateHeaders: e.target.checked }))
                    }
                    className="text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Tự động loại bỏ dòng tiêu đề lặp lại giữa các trang và tệp
                  </span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBatchSetupModalMode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetMode = batchSetupModalMode;
                  setBatchSetupModalMode(null);
                  if (targetMode === "auto") {
                    startBatchExecution("auto");
                  } else if (targetMode === "semi-auto") {
                    handleStartSemiAutoColumnScanWorkflow();
                  }
                }}
                className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer ${
                  batchSetupModalMode === "auto"
                    ? "bg-indigo-600 hover:bg-indigo-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {batchSetupModalMode === "auto" ? (
                  <Play className="w-4 h-4 fill-white" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {batchSetupModalMode === "auto"
                    ? `Bắt đầu Quét Tự động (${fileQueue.length} tệp)`
                    : `Bắt đầu Quét Cột Từng Tệp (Tệp 1/${fileQueue.length}) ➜`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Semi-Auto Granular Confirmation Modal for EACH file in sequence */}
      {semiAutoConfirmModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl space-y-4 p-5 sm:p-6 animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex-shrink-0">
                  <Sliders className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold font-mono">
                      Tệp {semiAutoConfirmModalItem.fileIndex + 1} / {semiAutoConfirmModalItem.totalFiles}
                    </span>
                    <h3 className="text-sm font-bold text-slate-800 break-all">
                      {semiAutoConfirmModalItem.fileName}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kiểm tra và tùy chỉnh danh sách cột trước khi chuyển sang tệp tiếp theo hoặc quét OCR toàn bộ.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSemiAutoConfirmModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Presets */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Chọn mẫu cột nhanh theo ngành nghề:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {VIETNAMESE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const newCols = p.columns.map((c, idx) => ({
                          id: `col-${semiAutoConfirmModalItem.fileId}-${Date.now()}-${idx}`,
                          name: c.name,
                          key: c.key,
                          type: c.type,
                          description: c.description,
                        }));
                        setSemiAutoConfirmModalItem((prev) =>
                          prev ? { ...prev, columns: newCols } : null
                        );
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-amber-50 hover:text-amber-800 border border-slate-200 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    >
                      {p.title.split("(")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Columns Editor List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="grid grid-cols-12 gap-2 px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <div className="col-span-1 text-center">STT</div>
                  <div className="col-span-5">Tên Cột</div>
                  <div className="col-span-3">Kiểu dữ liệu</div>
                  <div className="col-span-2">Mã Khóa (Key)</div>
                  <div className="col-span-1 text-right">Xóa</div>
                </div>

                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {semiAutoConfirmModalItem.columns.map((col, cIdx) => (
                    <div
                      key={col.id}
                      className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-slate-50 text-xs"
                    >
                      <div className="col-span-1 text-center font-mono text-slate-400 font-bold text-[11px]">
                        #{cIdx + 1}
                      </div>

                      <div className="col-span-5">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSemiAutoConfirmModalItem((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                columns: prev.columns.map((c, i) =>
                                  i === cIdx ? { ...c, name: val } : c
                                ),
                              };
                            });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                          placeholder="Tên cột..."
                        />
                      </div>

                      <div className="col-span-3">
                        <select
                          value={col.type}
                          onChange={(e) => {
                            const val = e.target.value as ColumnType;
                            setSemiAutoConfirmModalItem((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                columns: prev.columns.map((c, i) =>
                                  i === cIdx ? { ...c, type: val } : c
                                ),
                              };
                            });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-medium"
                        >
                          <option value="text">Văn bản</option>
                          <option value="number">Số lượng</option>
                          <option value="currency">Tiền tệ</option>
                          <option value="date">Ngày tháng</option>
                        </select>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          value={col.key}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSemiAutoConfirmModalItem((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                columns: prev.columns.map((c, i) =>
                                  i === cIdx ? { ...c, key: val } : c
                                ),
                              };
                            });
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-600 focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
                        />
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSemiAutoConfirmModalItem((prev) => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                columns: prev.columns.filter((_, i) => i !== cIdx),
                              };
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add column button */}
                <div className="p-2.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const nextNum = semiAutoConfirmModalItem.columns.length + 1;
                      const newCol: ColumnDef = {
                        id: `col-${semiAutoConfirmModalItem.fileId}-${Date.now()}`,
                        name: `Cột ${nextNum}`,
                        key: `col_${nextNum}`,
                        type: "text",
                      };
                      setSemiAutoConfirmModalItem((prev) =>
                        prev ? { ...prev, columns: [...prev.columns, newCol] } : null
                      );
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-100/70 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Cột mới</span>
                  </button>

                  <span className="text-xs text-slate-500 font-medium">
                    Tổng cộng: {semiAutoConfirmModalItem.columns.length} cột
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              {/* Option to apply to all remaining files */}
              {semiAutoConfirmModalItem.fileIndex < semiAutoConfirmModalItem.totalFiles - 1 ? (
                <button
                  type="button"
                  onClick={() => handleConfirmColumnForCurrentFile(true, false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  title="Áp dụng ngay cấu trúc cột này cho toàn bộ các tệp còn lại và hoàn tất bước nhận diện cột"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Áp dụng mẫu này cho {semiAutoConfirmModalItem.totalFiles - semiAutoConfirmModalItem.fileIndex - 1} tệp còn lại</span>
                </button>
              ) : (
                <div />
              )}

              {/* Next File or Start OCR Now */}
              <div className="flex items-center gap-2 justify-end">
                {semiAutoConfirmModalItem.fileIndex < semiAutoConfirmModalItem.totalFiles - 1 ? (
                  <button
                    type="button"
                    onClick={() => handleConfirmColumnForCurrentFile(false, false)}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md transition-colors cursor-pointer"
                  >
                    <span>Xác nhận &amp; Quét cột tệp tiếp theo ({semiAutoConfirmModalItem.fileIndex + 2}/{semiAutoConfirmModalItem.totalFiles})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfirmColumnForCurrentFile(false, true)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Xác nhận &amp; Bắt đầu Quét OCR Toàn Bộ Ngay 🚀</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Drawer for Inspecting & Editing Single File Columns */}
      {editingFileModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl space-y-4 p-5 sm:p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Cấu hình cột cho tệp: {editingFileModalItem.fileName}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Chế độ bán tự động &amp; thủ công: Xem trước và tinh chỉnh danh sách cột trước khi quét.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingFileModalItem(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Column Editor List */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Presets Quick Pick */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Nạp mẫu cột nhanh:
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {VIETNAMESE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        const newCols = p.columns.map((c, idx) => ({
                          id: `col-${editingFileModalItem.id}-${Date.now()}-${idx}`,
                          name: c.name,
                          key: c.key,
                          type: c.type,
                          description: c.description,
                        }));
                        setEditingFileModalItem((prev) => (prev ? { ...prev, columns: newCols } : null));
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      {p.title.split("(")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Columns Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase">
                  <div className="col-span-1 text-center">STT</div>
                  <div className="col-span-5">Tên Cột (Hiển thị &amp; Xuất)</div>
                  <div className="col-span-3">Kiểu dữ liệu</div>
                  <div className="col-span-2">Mã Khóa (Key)</div>
                  <div className="col-span-1 text-right">Xóa</div>
                </div>

                <div className="divide-y divide-slate-200 max-h-60 overflow-y-auto">
                  {editingFileModalItem.columns.map((col, cIdx) => (
                    <div
                      key={col.id}
                      className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center bg-white hover:bg-slate-50 text-xs"
                    >
                      <div className="col-span-1 text-center font-mono text-slate-400 font-bold">
                        {cIdx + 1}
                      </div>

                      <div className="col-span-5">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => {
                            const updatedCols = editingFileModalItem.columns.map((c) =>
                              c.id === col.id ? { ...c, name: e.target.value } : c
                            );
                            setEditingFileModalItem((prev) =>
                              prev ? { ...prev, columns: updatedCols } : null
                            );
                          }}
                          className="w-full px-2 py-1 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-3">
                        <select
                          value={col.type}
                          onChange={(e) => {
                            const updatedCols = editingFileModalItem.columns.map((c) =>
                              c.id === col.id ? { ...c, type: e.target.value as ColumnType } : c
                            );
                            setEditingFileModalItem((prev) =>
                              prev ? { ...prev, columns: updatedCols } : null
                            );
                          }}
                          className="w-full px-2 py-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                        >
                          <option value="text">Văn bản (Text)</option>
                          <option value="number">Số lượng (Number)</option>
                          <option value="currency">Tiền tệ (Currency)</option>
                          <option value="date">Ngày tháng (Date)</option>
                          <option value="code">Mã số (Code)</option>
                        </select>
                      </div>

                      <div className="col-span-2 font-mono text-[11px] text-slate-500 truncate">
                        {col.key}
                      </div>

                      <div className="col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (editingFileModalItem.columns.length <= 1) return;
                            const updatedCols = editingFileModalItem.columns.filter((c) => c.id !== col.id);
                            setEditingFileModalItem((prev) =>
                              prev ? { ...prev, columns: updatedCols } : null
                            );
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Column Button */}
              <button
                type="button"
                onClick={() => {
                  const newColId = `col-${Date.now()}`;
                  const count = editingFileModalItem.columns.length + 1;
                  const newCol: ColumnDef = {
                    id: newColId,
                    name: `Cột mới ${count}`,
                    key: `col_${count}`,
                    type: "text",
                  };
                  setEditingFileModalItem((prev) =>
                    prev ? { ...prev, columns: [...prev.columns, newCol] } : null
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm cột mới</span>
              </button>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  // Save columns to file in queue
                  setFileQueue((prev) =>
                    prev.map((f) =>
                      f.id === editingFileModalItem.id
                        ? { ...f, columns: editingFileModalItem.columns }
                        : f
                    )
                  );
                  setEditingFileModalItem(null);
                  notify("success", "Đã lưu cấu trúc cột cho tệp này");
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Lưu cấu trúc cột
              </button>

              <button
                type="button"
                onClick={handleScanFromModal}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Bắt đầu quét OCR tệp này</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results View: Consolidated Merged Table OR Multi-Sheet File Tabs */}
      {(mergedData.rows.length > 0 || (activeFile && activeFile.rows && activeFile.rows.length > 0)) && (
        <div className="space-y-4">
          {/* Top Export Toolbar for Bulk Results */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <span>Kết quả trích xuất hàng loạt</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                    {options.mergeFiles ? `${mergedData.rows.length} dòng tổng cộng` : `${totalRowsCount} dòng`}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {options.mergeFiles
                    ? "Đã hợp nhất tất cả tệp vào 1 bảng duy nhất với cột 'Tên tệp gốc'."
                    : "Dữ liệu được lưu độc lập theo từng tệp. Bạn có thể xuất 1 file Excel đa Sheet hoặc tải tệp ZIP."}
                </p>
              </div>
            </div>

            {/* Bulk Export Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filename input */}
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
                <span className="text-[11px] font-semibold text-slate-400 mr-1.5 hidden sm:inline">
                  Tên file:
                </span>
                <input
                  type="text"
                  value={bulkExportFilename}
                  onChange={(e) => setBulkExportFilename(e.target.value)}
                  placeholder="Tên file xuất..."
                  className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none w-32 sm:w-40"
                />
              </div>

              {options.mergeFiles ? (
                <>
                  <button
                    type="button"
                    onClick={handleExportMergedCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportMergedExcel}
                    className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Xuất Excel tổng hợp (.xlsx)</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleExportMultiSheetExcel}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer"
                    title="Mỗi tệp quét thành 1 Sheet riêng trong file Excel duy nhất"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Xuất Excel đa Sheet (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportZip("xlsx")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                    title="Tải tệp ZIP chứa các file Excel riêng lẻ cho từng tài liệu"
                  >
                    <FileArchive className="w-4 h-4 text-amber-600" />
                    <span>Tải file ZIP (.zip)</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Table Data Viewer */}
          {options.mergeFiles ? (
            <TableEditor
              columns={mergedData.columns}
              onChangeColumns={() => {}}
              rows={mergedData.rows}
              onChangeRows={() => {}}
              cropAreas={[]}
              documentName={bulkExportFilename}
            />
          ) : (
            <div className="space-y-3">
              {/* File Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {fileQueue.map((f) => {
                  const isActive = f.id === activeFile?.id;
                  const rowCount = f.rows?.length || 0;

                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFileId(f.id)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white shadow-xs"
                          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{f.fileName}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          isActive ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {rowCount} dòng
                      </span>
                    </button>
                  );
                })}
              </div>

              {activeFile && (
                <TableEditor
                  columns={activeFile.columns && activeFile.columns.length > 0 ? activeFile.columns : globalColumns}
                  onChangeColumns={(newCols) => {
                    setFileQueue((prev) =>
                      prev.map((f) => (f.id === activeFile.id ? { ...f, columns: newCols } : f))
                    );
                  }}
                  rows={activeFile.rows || []}
                  onChangeRows={(newRows) => {
                    setFileQueue((prev) =>
                      prev.map((f) => (f.id === activeFile.id ? { ...f, rows: newRows } : f))
                    );
                  }}
                  cropAreas={activeFile.cropAreas || []}
                  pages={activeFile.pages || []}
                  documentName={activeFile.fileName}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
