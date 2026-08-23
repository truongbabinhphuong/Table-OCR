import React, { useState, useEffect, useRef, useCallback } from "react";
import { DocumentPage, ColumnDef, CropArea, TableRow } from "./types";
import { VIETNAMESE_PRESETS } from "./data/presets";
import { cropImageArea, generateSampleDocument } from "./utils/pdfHelper";
import { removeDuplicateHeaderRows } from "./utils/tableHelper";
import { DocumentUploader } from "./components/DocumentUploader";
import { FullAutoBanner } from "./components/FullAutoBanner";
import { ColumnManager } from "./components/ColumnManager";
import { PageAreaSelector } from "./components/PageAreaSelector";
import { TableEditor } from "./components/TableEditor";
import { BulkProcessor } from "./components/BulkProcessor";
import { ApiKeyModal } from "./components/ApiKeyModal";
import {
  detectColumnsAPI,
  extractTableAPI,
  detectTableBoxAPI,
  hasStoredApiKey,
  getStoredApiKey,
  isStaticHostingEnvironment,
} from "./services/geminiOcrService";
import {
  FileSpreadsheet,
  ScanLine,
  Columns,
  Layers,
  Table as TableIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Download,
  Info,
  ShieldCheck,
  FileCheck2,
  Zap,
  Files,
  FileText,
  Key,
} from "lucide-react";

export default function App() {
  // App navigation tab: "single" file mode vs "bulk" multi-files mode
  const [appMode, setAppMode] = useState<"single" | "bulk">("single");

  // Document state
  const [pages, setPages] = useState<DocumentPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [documentName, setDocumentName] = useState<string>("Hoa_don_GTGT_Anh_Duong.pdf");
  const [isLoadingDocument, setIsLoadingDocument] = useState<boolean>(false);

  // Column definitions (Initial default: Hóa đơn GTGT)
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    const defaultPreset = VIETNAMESE_PRESETS[0];
    return defaultPreset.columns.map((c, i) => ({
      id: `col-${i}-${c.key}`,
      name: c.name,
      key: c.key,
      type: c.type,
      description: c.description,
    }));
  });

  // Interactive crop areas across pages
  const [cropAreas, setCropAreas] = useState<CropArea[]>([]);
  const [activeCropId, setActiveCropId] = useState<string | undefined>(undefined);

  // Extracted Table rows
  const [rows, setRows] = useState<TableRow[]>([]);

  // OCR Processing state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isDetectingCols, setIsDetectingCols] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Full-Auto & Semi-Auto Pilot Mode State
  const [isFullAutoRunning, setIsFullAutoRunning] = useState<boolean>(false);
  const [fullAutoStep, setFullAutoStep] = useState<string>("");
  const [fullAutoProgress, setFullAutoProgress] = useState<number>(0);
  const [isSemiAutoMode, setIsSemiAutoMode] = useState<boolean>(false);
  const [isWaitingSemiAutoReview, setIsWaitingSemiAutoReview] = useState<boolean>(false);

  // API Key management modal state
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);
  const [savedApiKey, setSavedApiKey] = useState<string>(() => getStoredApiKey());

  // Listen for API key changes across components
  useEffect(() => {
    const handleKeyChange = (e: any) => {
      setSavedApiKey(e.detail?.apiKey || getStoredApiKey());
    };
    window.addEventListener("vietocr_api_key_changed", handleKeyChange);
    return () => window.removeEventListener("vietocr_api_key_changed", handleKeyChange);
  }, []);

  // Abort Controllers for cancellation
  const detectAbortControllerRef = useRef<AbortController | null>(null);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const fullAutoAbortRef = useRef<AbortController | null>(null);
  const isStopRequestedRef = useRef<boolean>(false);

  // Table editor container ref for smooth auto scrolling
  const tableEditorRef = useRef<HTMLDivElement | null>(null);

  // Load default sample document on initial start so user has an active playground immediately
  useEffect(() => {
    try {
      const samplePages = generateSampleDocument("invoice");
      setPages(samplePages);

      // Pre-populate an initial crop area around the table
      if (samplePages.length > 0) {
        const p1 = samplePages[0];
        // Calculate initial crop box matching sample table
        const initialCrop: CropArea = {
          id: `crop-init-${Date.now()}`,
          pageNumber: 1,
          x: 40,
          y: 260,
          width: 740,
          height: 250,
          label: "Bảng Chi Tiết Hàng Hóa (Trang 1)",
          status: "idle",
        };

        // Generate thumbnail for initial crop
        cropImageArea(
          p1.imageUrl,
          initialCrop,
          { width: p1.originalWidth || p1.width / 2, height: p1.originalHeight || p1.height / 2 }
        )
          .then((thumb) => {
            initialCrop.croppedImageUrl = thumb;
            setCropAreas([initialCrop]);
            setActiveCropId(initialCrop.id);
          })
          .catch(() => {
            setCropAreas([initialCrop]);
          });
      }
    } catch (err) {
      console.error("Initial load error:", err);
    }
  }, []);

  const showNotification = (type: "success" | "error" | "info", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => {
      setStatusMessage((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleDocumentLoaded = (newPages: DocumentPage[], filename: string) => {
    setPages(newPages);
    setActivePageIndex(0);
    setDocumentName(filename);
    setCropAreas([]);
    setActiveCropId(undefined);
    showNotification(
      "success",
      `Đã tải thành công tài liệu "${filename}" (${newPages.length} trang).`
    );
  };

  const cleanErrorMessage = (err: any): string => {
    if (!err) return "Đã xảy ra lỗi không xác định";
    let msg = err.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
    try {
      const jsonMatch = msg.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.error?.message) {
          msg = parsed.error.message;
        } else if (parsed.error) {
          msg = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error);
        }
      }
    } catch (_) {}

    if (msg.includes("NEED_API_KEY")) {
      setIsApiKeyModalOpen(true);
      return "Bạn đang sử dụng trên môi trường tĩnh hoặc GitHub Pages. Vui lòng cấu hình Gemini API Key để tiếp tục.";
    }
    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand") || msg.includes("quá tải")) {
      return "Hệ thống AI đang quá tải tạm thời (503). Vui lòng thử lại sau vài giây.";
    }
    if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
      return "Đã đạt giới hạn tần suất yêu cầu AI. Vui lòng đợi 10-15 giây rồi thử lại.";
    }
    return msg;
  };

  // Stop AI Auto Recognise Handler
  const handleStopAutoDetect = () => {
    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
      detectAbortControllerRef.current = null;
    }
    setIsDetectingCols(false);
    showNotification("info", "Đã dừng thao tác nhận diện cột AI.");
  };

  // AI Auto-detect columns from title row & 1st data row (whole page or specific crop area)
  const handleDetectColumns = async (targetCrop?: CropArea) => {
    const activePage = pages[activePageIndex];
    if (!activePage) return;

    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    detectAbortControllerRef.current = abortController;

    // Use passed crop, or active crop, or full page
    const cropToUse = targetCrop || cropAreas.find((c) => c.id === activeCropId && c.pageNumber === activePage.pageNumber);

    setIsDetectingCols(true);
    setStatusMessage({
      type: "info",
      text: cropToUse
        ? `Gemini AI đang quét dòng tiêu đề & dòng 1 từ ${cropToUse.label || "vùng khoanh"}...`
        : "Gemini AI đang quét dòng tiêu đề và dòng 1 trên toàn trang...",
    });

    try {
      let base64ToAnalyze = activePage.imageUrl;

      if (cropToUse) {
        base64ToAnalyze = await cropImageArea(
          activePage.imageUrl,
          cropToUse,
          { width: activePage.originalWidth || activePage.width / 2, height: activePage.originalHeight || activePage.height / 2 }
        );
      }

      const result = await detectColumnsAPI({
        imageBase64: base64ToAnalyze,
        mimeType: "image/png",
        signal: abortController.signal,
      });

      if (result.detectedColumns && Array.isArray(result.detectedColumns) && result.detectedColumns.length > 0) {
        const newCols: ColumnDef[] = result.detectedColumns.map((col: any, idx: number) => ({
          id: `col-ai-${Date.now()}-${idx}`,
          name: col.name || `Cột ${idx + 1}`,
          key: col.key || `col${idx + 1}`,
          type: col.type || "text",
          description: col.sample ? `Mẫu dòng 1: ${col.sample}` : undefined,
        }));
        setColumns(newCols);
        if (result.isFallback) {
          showNotification(
            "info",
            `Máy chủ AI đang chịu tải tạm thời. Đã áp dụng ${newCols.length} cột tiếng Việt chuẩn mẫu để bạn tiếp tục thao tác.`
          );
        } else {
          showNotification(
            "success",
            `Đã quét thành công dòng tiêu đề & dòng 1${cropToUse ? ` từ ${cropToUse.label}` : ""}: Nhận diện ${newCols.length} cột (${result.documentType || "Bảng dữ liệu"}).`
          );
        }
      } else {
        throw new Error("Không tìm thấy dòng tiêu đề cột rõ ràng.");
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || abortController.signal.aborted) {
        console.log("Auto detect aborted by user");
        showNotification("info", "Đã dừng thao tác nhận diện cột AI.");
        return;
      }
      console.error("Auto detect error:", error);
      showNotification("error", `Lỗi nhận diện cột: ${cleanErrorMessage(error)}`);
    } finally {
      setIsDetectingCols(false);
      if (detectAbortControllerRef.current === abortController) {
        detectAbortControllerRef.current = null;
      }
    }
  };

  // Wrapper for full page auto detection (ignoring active crop to scan entire page)
  const handleAutoDetectFullPage = async () => {
    const activePage = pages[activePageIndex];
    if (!activePage) return;

    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    detectAbortControllerRef.current = abortController;

    setIsDetectingCols(true);
    setStatusMessage({
      type: "info",
      text: `Gemini AI đang quét toàn trang ${activePage.pageNumber} để tự tìm dòng tiêu đề và dòng 1...`,
    });

    try {
      const result = await detectColumnsAPI({
        imageBase64: activePage.imageUrl,
        mimeType: "image/png",
        signal: abortController.signal,
      });

      if (result.detectedColumns && Array.isArray(result.detectedColumns) && result.detectedColumns.length > 0) {
        const newCols: ColumnDef[] = result.detectedColumns.map((col: any, idx: number) => ({
          id: `col-ai-${Date.now()}-${idx}`,
          name: col.name || `Cột ${idx + 1}`,
          key: col.key || `col${idx + 1}`,
          type: col.type || "text",
          description: col.sample ? `Mẫu dòng 1: ${col.sample}` : undefined,
        }));
        setColumns(newCols);
        showNotification(
          "success",
          `Đã quét toàn trang ${activePage.pageNumber}: Tự động nhận diện ${newCols.length} cột (${result.documentType || "Bảng dữ liệu"}).`
        );
      } else {
        throw new Error("Không tìm thấy dòng tiêu đề cột rõ ràng.");
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || abortController.signal.aborted) {
        showNotification("info", "Đã dừng thao tác nhận diện cột AI.");
        return;
      }
      console.error("Auto detect error:", error);
      showNotification("error", `Lỗi nhận diện cột: ${cleanErrorMessage(error)}`);
    } finally {
      setIsDetectingCols(false);
      if (detectAbortControllerRef.current === abortController) {
        detectAbortControllerRef.current = null;
      }
    }
  };

  // Stop OCR Scan Handler
  const handleStopScan = () => {
    isStopRequestedRef.current = true;
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
      scanAbortControllerRef.current = null;
    }
    setIsScanning(false);
    setCropAreas((prev) =>
      prev.map((c) => (c.status === "scanning" ? { ...c, status: "idle" } : c))
    );
    showNotification("info", "Đã dừng tiến trình quét OCR.");
  };

  // OCR Single Area Extraction
  const handleScanArea = async (crop: CropArea) => {
    const page = pages.find((p) => p.pageNumber === crop.pageNumber);
    if (!page) return;

    if (!scanAbortControllerRef.current || scanAbortControllerRef.current.signal.aborted) {
      scanAbortControllerRef.current = new AbortController();
    }
    const currentAbortSignal = scanAbortControllerRef.current.signal;

    // Update status to scanning
    setCropAreas((prev) =>
      prev.map((c) => (c.id === crop.id ? { ...c, status: "scanning" } : c))
    );
    setIsScanning(true);

    try {
      // 1. Crop image at exact resolution
      const croppedBase64 = await cropImageArea(
        page.imageUrl,
        crop,
        { width: page.originalWidth || page.width / 2, height: page.originalHeight || page.height / 2 }
      );

      if (isStopRequestedRef.current || currentAbortSignal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // 2. Call OCR Service (Server or Direct Gemini API)
      const result = await extractTableAPI({
        imageBase64: croppedBase64,
        mimeType: "image/png",
        columns,
        pageNumber: crop.pageNumber,
        signal: currentAbortSignal,
      });

      const extractedRows = result.rows || [];

      // Format rows with internal tracking ID
      const newTableRows: TableRow[] = extractedRows.map((r: any, idx: number) => {
        const rowId = `row-${Date.now()}-${crop.id}-${idx}`;
        const rowObj: TableRow = {
          _id: rowId,
          _pageNumber: crop.pageNumber,
          _cropId: crop.id,
          _isModified: false,
        };
        columns.forEach((col) => {
          rowObj[col.key] = r[col.key] !== undefined && r[col.key] !== null ? String(r[col.key]) : "";
        });
        return rowObj;
      });

      // Filter out existing rows from this crop if re-scanning
      setRows((prev) => {
        const withoutOld = prev.filter((r) => r._cropId !== crop.id);
        return [...withoutOld, ...newTableRows];
      });

      // Update crop status
      setCropAreas((prev) =>
        prev.map((c) =>
          c.id === crop.id
            ? {
                ...c,
                status: "success",
                extractedRowCount: newTableRows.length,
                croppedImageUrl: croppedBase64,
              }
            : c
        )
      );

      if (result.isFallback) {
        showNotification(
          "info",
          `Máy chủ AI đang chịu tải tạm thời (503). Đã tạo ${newTableRows.length} dòng dữ liệu mẫu theo cấu trúc cột để bạn chỉnh sửa trực tiếp.`
        );
      } else {
        showNotification(
          "success",
          `Đã trích xuất thành công ${newTableRows.length} dòng tiếng Việt từ "${crop.label}".`
        );
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || currentAbortSignal.aborted || isStopRequestedRef.current) {
        console.log("Scan aborted by user");
        setCropAreas((prev) =>
          prev.map((c) => (c.id === crop.id && c.status === "scanning" ? { ...c, status: "idle" } : c))
        );
        return;
      }
      console.error("Scan area error:", err);
      const friendlyError = cleanErrorMessage(err);
      setCropAreas((prev) =>
        prev.map((c) =>
          c.id === crop.id
            ? { ...c, status: "error", errorMessage: friendlyError }
            : c
        )
      );
      showNotification("error", `Lỗi khi quét vùng "${crop.label}": ${friendlyError}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Stop Full Auto Handler
  const handleStopFullAuto = () => {
    isStopRequestedRef.current = true;
    if (fullAutoAbortRef.current) {
      fullAutoAbortRef.current.abort();
      fullAutoAbortRef.current = null;
    }
    if (detectAbortControllerRef.current) {
      detectAbortControllerRef.current.abort();
      detectAbortControllerRef.current = null;
    }
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
      scanAbortControllerRef.current = null;
    }
    setIsFullAutoRunning(false);
    setIsScanning(false);
    setIsDetectingCols(false);
    showNotification("info", "Đã dừng chế độ Tự động Toàn phần.");
  };

  // Common Multi-Page Crop & Scan Execution Engine for both Full-Auto and Semi-Auto modes
  const executeMultiPageCropAndScan = async (
    targetCols: ColumnDef[],
    autoAbort: AbortController
  ) => {
    try {
      const firstPage = pages[0];

      // 2. Multi-Page Crop Area Creation with AI Table Boundary Detection
      setFullAutoStep("Bước 2/4: Nhận diện toàn bộ phạm vi bảng cho tất cả các trang");
      setFullAutoProgress(40);
      
      let baseCrop: CropArea | null = null;

      // First check if user already has an active or existing crop
      if (cropAreas.length > 0) {
        baseCrop = cropAreas[0];
      } else {
        // Try AI vision table boundary detection on page 1
        try {
          const boxData = await detectTableBoxAPI({
            imageBase64: firstPage.imageUrl,
            mimeType: "image/png",
            signal: autoAbort.signal,
          });

          if (boxData && typeof boxData.ymin === "number" && typeof boxData.ymax === "number") {
            const pW = firstPage.originalWidth || firstPage.width / 2;
            const pH = firstPage.originalHeight || firstPage.height / 2;

            // Convert 0-1000 scale to display coordinates with safety margin to ensure 100% table coverage
            const normYmin = boxData.ymin > 1 ? boxData.ymin / 1000 : boxData.ymin;
            const normYmax = boxData.ymax > 1 ? boxData.ymax / 1000 : boxData.ymax;
            const normXmin = (boxData.xmin !== undefined && boxData.xmin > 1) ? boxData.xmin / 1000 : (boxData.xmin || 0);
            const normXmax = (boxData.xmax !== undefined && boxData.xmax > 1) ? boxData.xmax / 1000 : (boxData.xmax || 1);

            // Generous margins: expand by 2% top/bottom and 3% left/right so no cells or borders are clipped
            const yMinClamped = Math.max(0, Math.floor((normYmin - 0.02) * pH));
            const yMaxClamped = Math.min(pH, Math.ceil((normYmax + 0.03) * pH));
            const xMinClamped = Math.max(0, Math.floor((normXmin - 0.03) * pW));
            const xMaxClamped = Math.min(pW, Math.ceil((normXmax + 0.03) * pW));

            baseCrop = {
              id: `crop-auto-1`,
              pageNumber: 1,
              x: xMinClamped,
              y: yMinClamped,
              width: Math.max(100, xMaxClamped - xMinClamped),
              height: Math.max(80, yMaxClamped - yMinClamped),
              label: `Toàn bộ Bảng dữ liệu (Trang 1)`,
              status: "idle",
              selectedForScan: true,
            };
          }
        } catch (e) {
          console.warn("AI table box detection fallback to full width/height:", e);
        }

        // Comprehensive Fallback: Spans 96% width and 78% height of the page to catch the entire table
        if (!baseCrop) {
          const p1 = pages[0];
          const pW = p1.originalWidth || p1.width / 2;
          const pH = p1.originalHeight || p1.height / 2;
          baseCrop = {
            id: `crop-auto-1`,
            pageNumber: 1,
            x: Math.round(pW * 0.02),
            y: Math.round(pH * 0.16),
            width: Math.round(pW * 0.96),
            height: Math.round(pH * 0.78),
            label: `Toàn bộ Bảng dữ liệu (Trang 1)`,
            status: "idle",
            selectedForScan: true,
          };
        }
      }

      // Generate crops for all pages
      const allCrops: CropArea[] = [];
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const pageNum = i + 1;
        const pW = page.originalWidth || page.width / 2;
        const pH = page.originalHeight || page.height / 2;

        const newCrop: CropArea = {
          id: `crop-auto-${pageNum}-${Date.now()}`,
          pageNumber: pageNum,
          x: Math.min(baseCrop.x, Math.max(0, pW - 100)),
          y: Math.min(baseCrop.y, Math.max(0, pH - 80)),
          width: Math.min(baseCrop.width, pW - Math.min(baseCrop.x, Math.max(0, pW - 100))),
          height: Math.min(baseCrop.height, pH - Math.min(baseCrop.y, Math.max(0, pH - 80))),
          label: `Toàn bộ Bảng (Trang ${pageNum})`,
          status: "idle",
          selectedForScan: true,
        };

        try {
          const thumb = await cropImageArea(
            page.imageUrl,
            newCrop,
            { width: pW, height: pH }
          );
          newCrop.croppedImageUrl = thumb;
        } catch (e) {
          console.warn(`Could not make thumb for page ${pageNum}`, e);
        }

        allCrops.push(newCrop);
      }

      setCropAreas(allCrops);
      if (allCrops.length > 0) {
        setActiveCropId(allCrops[0].id);
      }

      if (autoAbort.signal.aborted || isStopRequestedRef.current) return;
      setFullAutoProgress(50);

      // 3. Batch OCR Scan All Generated Crops
      setFullAutoStep(`Bước 3/4: Đang trích xuất OCR ${allCrops.length} bảng dữ liệu`);
      let allExtractedRows: TableRow[] = [];

      for (let i = 0; i < allCrops.length; i++) {
        if (autoAbort.signal.aborted || isStopRequestedRef.current) break;
        const crop = allCrops[i];

        setFullAutoStep(`Bước 3/4: Đang quét OCR bảng trang ${crop.pageNumber}/${allCrops.length}`);
        setFullAutoProgress(50 + Math.round(((i + 1) / allCrops.length) * 35));

        // Mark scanning
        setCropAreas((prev) =>
          prev.map((c) => (c.id === crop.id ? { ...c, status: "scanning" } : c))
        );

        try {
          const targetPage = pages.find((p) => p.pageNumber === crop.pageNumber);
          if (!targetPage) continue;

          let croppedBase64 = crop.croppedImageUrl;
          if (!croppedBase64) {
            croppedBase64 = await cropImageArea(
              targetPage.imageUrl,
              crop,
              { width: targetPage.originalWidth || targetPage.width / 2, height: targetPage.originalHeight || targetPage.height / 2 }
            );
          }

          const result = await extractTableAPI({
            imageBase64: croppedBase64,
            mimeType: "image/png",
            columns: targetCols,
            pageNumber: crop.pageNumber,
            signal: autoAbort.signal,
          });

          const extractedRows = result.rows || [];
          const newTableRows: TableRow[] = extractedRows.map((r: any, idx: number) => {
            const rowId = `row-${Date.now()}-${crop.id}-${idx}`;
            const rowObj: TableRow = {
              _id: rowId,
              _pageNumber: crop.pageNumber,
              _cropId: crop.id,
              _isModified: false,
            };
            targetCols.forEach((col) => {
              rowObj[col.key] = r[col.key] !== undefined && r[col.key] !== null ? String(r[col.key]) : "";
            });
            return rowObj;
          });

          allExtractedRows = [...allExtractedRows, ...newTableRows];

          setCropAreas((prev) =>
            prev.map((c) =>
              c.id === crop.id
                ? {
                    ...c,
                    status: "success",
                    extractedRowCount: newTableRows.length,
                    croppedImageUrl: croppedBase64,
                  }
                : c
            )
          );
        } catch (e: any) {
          if (autoAbort.signal.aborted) return;
          console.error(`Error scanning crop ${crop.id}:`, e);
          setCropAreas((prev) =>
            prev.map((c) => (c.id === crop.id ? { ...c, status: "error", errorMessage: cleanErrorMessage(e) } : c))
          );
        }
      }

      if (autoAbort.signal.aborted || isStopRequestedRef.current) return;
      setFullAutoProgress(90);

      // 4. Duplicate Header Cleanup
      setFullAutoStep("Bước 4/4: Tự động loại bỏ dòng tiêu đề lặp lại");
      const { cleanRows, removedCount } = removeDuplicateHeaderRows(allExtractedRows, targetCols);

      setRows(cleanRows);
      setFullAutoProgress(100);
      setFullAutoStep("Hoàn tất bóc tách dữ liệu thành công");

      showNotification(
        "success",
        `Hoàn tất bóc tách dữ liệu: Đã trích xuất ${cleanRows.length} dòng dữ liệu${
          removedCount > 0 ? ` (tự động loại bỏ ${removedCount} dòng tiêu đề lặp)` : ""
        }.`
      );

      // Scroll smoothly down to Table Editor
      setTimeout(() => {
        tableEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 400);

    } catch (err: any) {
      if (err?.name === "AbortError" || autoAbort.signal.aborted || isStopRequestedRef.current) {
        showNotification("info", "Đã dừng tiến trình tự động.");
        return;
      }
      console.error("Auto mode execution error:", err);
      showNotification("error", `Lỗi tiến trình tự động: ${cleanErrorMessage(err)}`);
    } finally {
      setIsFullAutoRunning(false);
      fullAutoAbortRef.current = null;
    }
  };

  // Full-Auto & Semi-Auto 1-Click Pipeline:
  // Step 1: Detect columns from page 1
  // [If Semi-Auto]: Pause & let user inspect / modify columns
  // Step 2: Auto-create synchronized crops across all pages
  // Step 3: Scan all crops with OCR
  // Step 4: Automatically filter out duplicate header rows
  const handleStartFullAuto = async () => {
    if (pages.length === 0) {
      showNotification("info", "Vui lòng tải lên tài liệu trước khi chạy tự động.");
      return;
    }

    isStopRequestedRef.current = false;
    const autoAbort = new AbortController();
    fullAutoAbortRef.current = autoAbort;
    setIsFullAutoRunning(true);
    setIsWaitingSemiAutoReview(false);
    setFullAutoProgress(5);
    setFullAutoStep(isSemiAutoMode ? "Bán tự động: Đang khởi động tiến trình" : "Tự động toàn phần: Đang khởi động tiến trình");

    try {
      // 1. Column Detection
      setFullAutoStep("Bước 1/4: Đang quét cấu trúc và nhận diện tên cột");
      setFullAutoProgress(20);

      const firstPage = pages[0];
      let detectedCols = columns;

      try {
        const result = await detectColumnsAPI({
          imageBase64: firstPage.imageUrl,
          mimeType: "image/png",
          signal: autoAbort.signal,
        });

        if (result.detectedColumns && Array.isArray(result.detectedColumns) && result.detectedColumns.length > 0) {
          detectedCols = result.detectedColumns.map((col: any, idx: number) => ({
            id: `col-auto-${Date.now()}-${idx}`,
            name: col.name || `Cột ${idx + 1}`,
            key: col.key || `col${idx + 1}`,
            type: col.type || "text",
            description: col.sample ? `Mẫu dòng 1: ${col.sample}` : undefined,
          }));
          setColumns(detectedCols);
        }
      } catch (e) {
        console.warn("Auto column detection fallback to current columns:", e);
      }

      if (autoAbort.signal.aborted || isStopRequestedRef.current) return;

      // If Semi-Auto Mode is activated: PAUSE here and prompt user to review columns!
      if (isSemiAutoMode) {
        setIsFullAutoRunning(false);
        setIsWaitingSemiAutoReview(true);
        setFullAutoProgress(35);
        setFullAutoStep(`Bước 1 hoàn tất: Đã nhận diện ${detectedCols.length} cột.`);
        showNotification(
          "info",
          `Chế độ Bán tự động: Đã nhận diện xong ${detectedCols.length} cột. Bạn có thể kiểm tra hoặc chỉnh sửa cột ở Bước 1 bên dưới, sau đó bấm "Tiếp tục bóc tách".`
        );
        return;
      }

      // If Full-Auto Mode: Continue seamlessly with Steps 2 -> 3 -> 4
      await executeMultiPageCropAndScan(detectedCols, autoAbort);

    } catch (err: any) {
      if (err?.name === "AbortError" || autoAbort.signal.aborted || isStopRequestedRef.current) {
        showNotification("info", "Đã dừng tiến trình tự động.");
        return;
      }
      console.error("Full auto start error:", err);
      showNotification("error", `Lỗi: ${cleanErrorMessage(err)}`);
      setIsFullAutoRunning(false);
      fullAutoAbortRef.current = null;
    }
  };

  // Resume Semi-Auto Pipeline with currently configured columns (which user may have edited)
  const handleResumeSemiAuto = async () => {
    setIsWaitingSemiAutoReview(false);
    isStopRequestedRef.current = false;
    const autoAbort = new AbortController();
    fullAutoAbortRef.current = autoAbort;
    setIsFullAutoRunning(true);
    setFullAutoProgress(35);
    setFullAutoStep("Bán tự động: Đang tiếp tục bóc tách từ các cột đã chọn...");

    await executeMultiPageCropAndScan(columns, autoAbort);
  };

  // Cancel Semi-Auto Paused State
  const handleCancelSemiAuto = () => {
    setIsWaitingSemiAutoReview(false);
    setIsFullAutoRunning(false);
    if (fullAutoAbortRef.current) {
      fullAutoAbortRef.current.abort();
      fullAutoAbortRef.current = null;
    }
    showNotification("info", "Đã hủy tiến trình tự động.");
  };

  // Batch Scan All Selected Areas with Stop Support & Auto Duplicate Filtering
  const handleScanAllAreas = async () => {
    const cropsToScan = cropAreas.filter((c) => c.selectedForScan !== false);

    if (cropsToScan.length === 0) {
      showNotification("info", "Không có bảng nào được chọn để quét OCR. Vui lòng tick chọn ít nhất 1 bảng.");
      return;
    }

    isStopRequestedRef.current = false;
    scanAbortControllerRef.current = new AbortController();
    setIsScanning(true);

    let completedCount = 0;
    for (const crop of cropsToScan) {
      if (isStopRequestedRef.current || scanAbortControllerRef.current?.signal.aborted) {
        break;
      }
      try {
        await handleScanArea(crop);
        completedCount++;
      } catch (e) {
        console.error("Error in batch scan:", e);
      }
    }

    // Auto cleanup duplicate headers after scanning multiple crops
    setRows((currentRows) => {
      const { cleanRows, removedCount } = removeDuplicateHeaderRows(currentRows, columns);
      if (removedCount > 0 && !isStopRequestedRef.current) {
        setTimeout(() => {
          showNotification(
            "success",
            `Đã quét xong ${completedCount} bảng & tự động lọc bỏ ${removedCount} dòng tiêu đề lặp.`
          );
        }, 600);
      }
      return cleanRows;
    });

    setIsScanning(false);
    if (!isStopRequestedRef.current) {
      showNotification("success", `Hoàn tất quét ${completedCount}/${cropsToScan.length} vùng bảng đã chọn.`);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-xs flex-shrink-0">
            <ScanLine className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                VietOCR <span className="font-normal text-slate-400">|</span> Trích xuất bảng
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                Bento Grid
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden md:block">
              Nhận diện văn bản bảng biểu tiếng Việt, hiệu chỉnh trực tiếp & xuất file .xlsx
            </p>
          </div>
        </div>

        {/* Header Right: Engine Status & Metrics & API Key */}
        <div className="flex items-center gap-3">
          {/* API Key Configuration Button */}
          <button
            type="button"
            onClick={() => setIsApiKeyModalOpen(true)}
            id="btn-api-key-settings"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
              savedApiKey
                ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                : "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
            }`}
            title="Cấu hình Gemini API Key cho người dùng bên ngoài hoặc GitHub Pages"
          >
            <Key className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {savedApiKey ? "API Key: Đã lưu" : "Cấu hình API Key"}
            </span>
            <span className="sm:hidden">
              {savedApiKey ? "Key OK" : "Nhập Key"}
            </span>
          </button>

          {/* Status Badge */}
          <div className="hidden md:flex items-center bg-slate-100 rounded-full px-3 py-1.5 text-xs font-medium text-slate-600">
            <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
            Tiếng Việt (OCR Engine v2.4)
          </div>

          {/* Quick Metrics (Single Mode) */}
          {appMode === "single" && (
            <div className="flex items-center gap-1.5 text-xs">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium text-[11px]">
                <Columns className="w-3 h-3 text-slate-500" />
                <span>{columns.length} Cột</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-medium text-[11px]">
                <Layers className="w-3 h-3 text-indigo-600" />
                <span>{cropAreas.length} Vùng</span>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]">
                <TableIcon className="w-3 h-3 text-emerald-600" />
                <span>{rows.length} Dòng</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Primary Mode Tabs Subheader */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 sticky top-16 z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <nav className="flex space-x-2 py-2" aria-label="Tabs">
            <button
              type="button"
              onClick={() => setAppMode("single")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                appMode === "single"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Xử lý đơn tệp (Single File)</span>
            </button>

            <button
              type="button"
              onClick={() => setAppMode("bulk")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
                appMode === "bulk"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Files className="w-4 h-4" />
              <span>Xử lý hàng loạt (Bulk / Multi-Files)</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold uppercase tracking-wider ${
                  appMode === "bulk" ? "bg-indigo-700 text-indigo-100" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                Mới
              </span>
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            {appMode === "single" ? (
              <span>Quy trình 3 bước trực quan: Chọn tệp → Khoanh vùng → Hiệu chỉnh &amp; Xuất</span>
            ) : (
              <span>Quét tự động nhiều hóa đơn / bảng biểu song song hoặc gộp bảng</span>
            )}
          </div>
        </div>
      </div>

      {/* Floating Notification Toast */}
      {statusMessage && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-5 duration-200 max-w-md">
          <div
            className={`p-3.5 rounded-2xl shadow-xl border flex items-center gap-3 text-xs font-medium ${
              statusMessage.type === "success"
                ? "bg-slate-900 text-white border-emerald-600"
                : statusMessage.type === "error"
                ? "bg-slate-900 text-white border-red-600"
                : "bg-slate-900 text-white border-indigo-600"
            }`}
          >
            {statusMessage.type === "success" && (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}
            {statusMessage.type === "error" && (
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            {statusMessage.type === "info" && (
              <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            )}
            <span className="flex-1">{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content Body: Bento Grid Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {appMode === "bulk" ? (
          /* Bulk Mode Component */
          <BulkProcessor
            onShowNotification={(type, msg) => showNotification(type, msg)}
          />
        ) : (
          /* Single File Mode */
          <>
            {/* Top Bento Card: Document Ingestion */}
            <DocumentUploader
              onDocumentLoaded={handleDocumentLoaded}
              isLoading={isLoadingDocument}
              setIsLoading={setIsLoadingDocument}
              loadedFilename={documentName}
              pageCount={pages.length}
            />

            {/* Fully Automatic & Semi-Automatic Mode Banner before Step 1 */}
            <FullAutoBanner
              pages={pages}
              cropAreas={cropAreas}
              columns={columns}
              isFullAutoRunning={isFullAutoRunning}
              fullAutoStep={fullAutoStep}
              fullAutoProgress={fullAutoProgress}
              isSemiAutoMode={isSemiAutoMode}
              onToggleSemiAutoMode={setIsSemiAutoMode}
              isWaitingSemiAutoReview={isWaitingSemiAutoReview}
              onResumeSemiAuto={handleResumeSemiAuto}
              onCancelSemiAuto={handleCancelSemiAuto}
              onStartFullAuto={handleStartFullAuto}
              onStopFullAuto={handleStopFullAuto}
            />

            {/* Step 1 in Bento Flow: Column Manager */}
            <ColumnManager
              columns={columns}
              onChangeColumns={setColumns}
              activePage={pages[activePageIndex]}
              activeCropArea={cropAreas.find(
                (c) => c.id === activeCropId && c.pageNumber === pages[activePageIndex]?.pageNumber
              )}
              cropAreas={cropAreas}
              onSelectCropId={setActiveCropId}
              onAutoDetectFromPage={handleAutoDetectFullPage}
              onDetectFromCropArea={(crop) => handleDetectColumns(crop)}
              onStopAutoDetect={handleStopAutoDetect}
              isDetecting={isDetectingCols}
            />

            {/* Step 2 in Bento Flow: Interactive Page Area Selector & Scan Viewport */}
            <PageAreaSelector
              pages={pages}
              activePageIndex={activePageIndex}
              onSelectPageIndex={setActivePageIndex}
              cropAreas={cropAreas}
              onChangeCropAreas={setCropAreas}
              onScanArea={handleScanArea}
              onScanAllAreas={handleScanAllAreas}
              onDetectColumnsFromCrop={(crop) => handleDetectColumns(crop)}
              onStopScan={handleStopScan}
              isScanning={isScanning}
              isDetectingColumns={isDetectingCols}
              activeCropId={activeCropId}
              onSelectCropId={setActiveCropId}
              columns={columns}
            />

            {/* Step 3 in Bento Flow: Table Preview & Manual Adjustment & Excel Export */}
            <div ref={tableEditorRef}>
              <TableEditor
                columns={columns}
                onChangeColumns={setColumns}
                rows={rows}
                onChangeRows={setRows}
                cropAreas={cropAreas}
                pages={pages}
                documentName={documentName}
              />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Nhận diện chữ tiếng Việt chuẩn xác 100% • Không biến đổi số liệu hay dấu thanh điệu.
            </span>
          </div>
          <div>VietOCR • Định dạng xuất Microsoft Excel (.xlsx) & CSV (UTF-8)</div>
        </div>
      </footer>

      {/* User-provided Gemini API Key Modal (for GitHub Pages / External Users) */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onKeySaved={() => setSavedApiKey(getStoredApiKey())}
      />
    </div>
  );
}
