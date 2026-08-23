import React, { useState, useRef, useEffect, useCallback } from "react";
import { DocumentPage, CropArea, ColumnDef } from "../types";
import { cropImageArea } from "../utils/pdfHelper";
import {
  Crop,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Trash2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sliders,
  Sparkles,
  Square,
  Ban,
  Columns3,
  ScanLine,
  Crosshair,
  CopyPlus,
  CheckSquare,
  Check,
  MoveUp,
  MoveDown,
} from "lucide-react";

interface PageAreaSelectorProps {
  pages: DocumentPage[];
  activePageIndex: number;
  onSelectPageIndex: (index: number) => void;
  cropAreas: CropArea[];
  onChangeCropAreas: (areas: CropArea[]) => void;
  onScanArea: (area: CropArea) => Promise<void>;
  onScanAllAreas: () => Promise<void>;
  onDetectColumnsFromCrop?: (crop: CropArea) => void;
  onStopScan?: () => void;
  isScanning: boolean;
  isDetectingColumns?: boolean;
  activeCropId?: string;
  onSelectCropId?: (id: string) => void;
  columns: ColumnDef[];
}

export const PageAreaSelector: React.FC<PageAreaSelectorProps> = ({
  pages,
  activePageIndex,
  onSelectPageIndex,
  cropAreas,
  onChangeCropAreas,
  onScanArea,
  onScanAllAreas,
  onDetectColumnsFromCrop,
  onStopScan,
  isScanning,
  isDetectingColumns = false,
  activeCropId,
  onSelectCropId,
  columns,
}) => {
  const activePage = pages[activePageIndex];

  const [zoom, setZoom] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [imageFilter, setImageFilter] = useState<"normal" | "contrast" | "grayscale">("normal");

  // Drag-to-draw state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDraw, setCurrentDraw] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Resize / move interaction state
  const [interactingCropId, setInteractingCropId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<"move" | "resize" | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number; initialBox: CropArea } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const currentPageCrops = cropAreas.filter(
    (c) => c.pageNumber === (activePage?.pageNumber || 1)
  );

  const activeCrop = cropAreas.find(
    (c) => c.id === activeCropId && c.pageNumber === (activePage?.pageNumber || 1)
  );

  // Selected for scan count
  const selectedCrops = cropAreas.filter((c) => c.selectedForScan !== false);
  const allSelected = cropAreas.length > 0 && selectedCrops.length === cropAreas.length;

  // Toggle selection for all crops
  const handleToggleSelectAll = (checked: boolean) => {
    onChangeCropAreas(
      cropAreas.map((c) => ({
        ...c,
        selectedForScan: checked,
      }))
    );
  };

  // Toggle individual crop selection
  const handleToggleCropSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChangeCropAreas(
      cropAreas.map((c) =>
        c.id === id
          ? { ...c, selectedForScan: c.selectedForScan === false ? true : false }
          : c
      )
    );
  };

  // Copy active crop area to all other pages
  const handleCopyCropToAllPages = async (sourceCrop: CropArea) => {
    if (pages.length <= 1) return;

    const otherPages = pages.filter((p) => p.pageNumber !== sourceCrop.pageNumber);
    const existingCropsFromCurrentPage = cropAreas.filter(
      (c) => c.pageNumber === sourceCrop.pageNumber
    );

    const newCopiedCrops: CropArea[] = [];

    for (const p of otherPages) {
      const newCropId = `crop-copy-p${p.pageNumber}-${Date.now()}`;
      let thumbUrl = "";
      try {
        thumbUrl = await cropImageArea(
          p.imageUrl,
          sourceCrop,
          {
            width: imageRef.current?.clientWidth || 800,
            height: imageRef.current?.clientHeight || 1100,
          }
        );
      } catch (e) {
        console.error("Error creating thumbnail for copied crop:", e);
      }

      newCopiedCrops.push({
        id: newCropId,
        pageNumber: p.pageNumber,
        x: sourceCrop.x,
        y: sourceCrop.y,
        width: sourceCrop.width,
        height: sourceCrop.height,
        label: `Bảng (Trang ${p.pageNumber})`,
        status: "idle",
        croppedImageUrl: thumbUrl || sourceCrop.croppedImageUrl,
        selectedForScan: true,
      });
    }

    onChangeCropAreas([...existingCropsFromCurrentPage, ...newCopiedCrops]);
  };

  // Helper to convert mouse event to relative image coordinates
  const getImageRelativeCoords = (e: React.MouseEvent) => {
    if (!imageRef.current) return { x: 0, y: 0 };
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    return { x, y, width: rect.width, height: rect.height };
  };

  // Start drawing new crop box
  const handleMouseDown = (e: React.MouseEvent) => {
    if (interactingCropId || isScanning) return;
    // Only primary button
    if (e.button !== 0) return;

    const { x, y } = getImageRelativeCoords(e);
    setIsDrawing(true);
    setDrawStart({ x, y });
    setCurrentDraw({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDrawing && drawStart && imageRef.current) {
      const { x, y } = getImageRelativeCoords(e);
      const startX = Math.min(drawStart.x, x);
      const startY = Math.min(drawStart.y, y);
      const width = Math.abs(x - drawStart.x);
      const height = Math.abs(y - drawStart.y);

      setCurrentDraw({ x: startX, y: startY, width, height });
      return;
    }

    if (interactingCropId && dragStartPos && interactionMode && imageRef.current) {
      const { x, y, width: imgW, height: imgH } = getImageRelativeCoords(e);
      const dx = x - dragStartPos.x;
      const dy = y - dragStartPos.y;
      const init = dragStartPos.initialBox;

      if (interactionMode === "move") {
        const newX = Math.max(0, Math.min(imgW - init.width, init.x + dx));
        const newY = Math.max(0, Math.min(imgH - init.height, init.y + dy));

        onChangeCropAreas(
          cropAreas.map((c) =>
            c.id === interactingCropId ? { ...c, x: newX, y: newY } : c
          )
        );
      } else if (interactionMode === "resize" && resizeHandle) {
        let newX = init.x;
        let newY = init.y;
        let newW = init.width;
        let newH = init.height;

        if (resizeHandle.includes("e")) newW = Math.max(20, init.width + dx);
        if (resizeHandle.includes("s")) newH = Math.max(20, init.height + dy);
        if (resizeHandle.includes("w")) {
          const clampedDx = Math.min(dx, init.width - 20);
          newX = init.x + clampedDx;
          newW = init.width - clampedDx;
        }
        if (resizeHandle.includes("n")) {
          const clampedDy = Math.min(dy, init.height - 20);
          newY = init.y + clampedDy;
          newH = init.height - clampedDy;
        }

        onChangeCropAreas(
          cropAreas.map((c) =>
            c.id === interactingCropId
              ? { ...c, x: newX, y: newY, width: newW, height: newH }
              : c
          )
        );
      }
    }
  };

  const handleMouseUp = async () => {
    if (isDrawing && currentDraw && imageRef.current) {
      setIsDrawing(false);
      setDrawStart(null);

      // Only accept if area is at least 30x20
      if (currentDraw.width >= 30 && currentDraw.height >= 20) {
        const newId = `crop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const pageNum = activePage.pageNumber;

        // Generate thumbnail preview
        let croppedUrl = "";
        try {
          croppedUrl = await cropImageArea(
            activePage.imageUrl,
            currentDraw,
            {
              width: imageRef.current.clientWidth,
              height: imageRef.current.clientHeight,
            }
          );
        } catch (err) {
          console.error("Crop preview error:", err);
        }

        const newCrop: CropArea = {
          id: newId,
          pageNumber: pageNum,
          x: currentDraw.x,
          y: currentDraw.y,
          width: currentDraw.width,
          height: currentDraw.height,
          label: `Bảng ${cropAreas.length + 1} (Trang ${pageNum})`,
          status: "idle",
          croppedImageUrl: croppedUrl,
        };

        onChangeCropAreas([...cropAreas, newCrop]);
        if (onSelectCropId) onSelectCropId(newId);
      }
      setCurrentDraw(null);
    }

    if (interactingCropId) {
      // Re-generate crop thumbnail on edit completion
      const targetCrop = cropAreas.find((c) => c.id === interactingCropId);
      if (targetCrop && imageRef.current) {
        try {
          const croppedUrl = await cropImageArea(
            activePage.imageUrl,
            targetCrop,
            {
              width: imageRef.current.clientWidth,
              height: imageRef.current.clientHeight,
            }
          );
          onChangeCropAreas(
            cropAreas.map((c) =>
              c.id === interactingCropId ? { ...c, croppedImageUrl: croppedUrl } : c
            )
          );
        } catch (e) {
          console.error("Error refreshing thumbnail", e);
        }
      }

      setInteractingCropId(null);
      setInteractionMode(null);
      setResizeHandle(null);
      setDragStartPos(null);
    }
  };

  const handleRemoveCrop = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onChangeCropAreas(cropAreas.filter((c) => c.id !== id));
  };

  const handleMoveCrop = (index: number, direction: "up" | "down", e: React.MouseEvent) => {
    e.stopPropagation();
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= cropAreas.length) return;
    const newCrops = [...cropAreas];
    const temp = newCrops[index];
    newCrops[index] = newCrops[targetIdx];
    newCrops[targetIdx] = temp;
    onChangeCropAreas(newCrops);
  };

  const startMovingCrop = (crop: CropArea, e: React.MouseEvent) => {
    e.stopPropagation();
    setInteractingCropId(crop.id);
    setInteractionMode("move");
    const { x, y } = getImageRelativeCoords(e);
    setDragStartPos({ x, y, initialBox: { ...crop } });
    if (onSelectCropId) onSelectCropId(crop.id);
  };

  const startResizingCrop = (crop: CropArea, handle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInteractingCropId(crop.id);
    setInteractionMode("resize");
    setResizeHandle(handle);
    const { x, y } = getImageRelativeCoords(e);
    setDragStartPos({ x, y, initialBox: { ...crop } });
    if (onSelectCropId) onSelectCropId(crop.id);
  };

  // Filter styles for contrast booster
  const getFilterStyle = () => {
    if (imageFilter === "contrast") {
      return "contrast-150 brightness-95 saturate-50";
    }
    if (imageFilter === "grayscale") {
      return "grayscale contrast-125";
    }
    return "";
  };

  if (!activePage) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
        Vui lòng nạp tài liệu hoặc chọn mẫu tài liệu tiếng Việt phía trên để bắt đầu.
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        {/* Step label */}
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
              2
            </span>
            <span>Vùng chọn bảng (Scan Area)</span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
              {cropAreas.length} vùng
            </span>
          </h3>
        </div>

        {/* Action Buttons & Page Navigation */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Page Selector */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              disabled={activePageIndex <= 0}
              onClick={() => onSelectPageIndex(activePageIndex - 1)}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"
              title="Trang trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 font-medium text-slate-700 select-none text-xs">
              Trang {activePageIndex + 1} / {pages.length}
            </span>
            <button
              type="button"
              disabled={activePageIndex >= pages.length - 1}
              onClick={() => onSelectPageIndex(activePageIndex + 1)}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-30 cursor-pointer"
              title="Trang tiếp theo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Thu nhỏ"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-600 select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              title="Phóng to"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1.0);
                setRotation(0);
              }}
              className="p-1 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer ml-0.5"
              title="Khôi phục kích thước ban đầu"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter enhancement */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-xs shadow-2xs">
            <button
              type="button"
              onClick={() =>
                setImageFilter((f) =>
                  f === "normal"
                    ? "contrast"
                    : f === "contrast"
                    ? "grayscale"
                    : "normal"
                )
              }
              className="inline-flex items-center gap-1 px-2 py-1 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer text-xs"
              title="Đổi bộ lọc tăng nét chữ quét"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                {imageFilter === "normal"
                  ? "Ảnh gốc"
                  : imageFilter === "contrast"
                  ? "Tăng nét"
                  : "Đen trắng"}
              </span>
            </button>
          </div>

          {/* Quick Actions & Scan Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Action: Auto Expand / Select Whole Page Table */}
            {activePage && (
              <button
                type="button"
                onClick={async () => {
                  const pW = activePage.originalWidth || activePage.width / 2;
                  const pH = activePage.originalHeight || activePage.height / 2;
                  const fullTableCrop: CropArea = {
                    id: `crop-full-p${activePage.pageNumber}-${Date.now()}`,
                    pageNumber: activePage.pageNumber,
                    x: Math.round(pW * 0.02),
                    y: Math.round(pH * 0.12),
                    width: Math.round(pW * 0.96),
                    height: Math.round(pH * 0.82),
                    label: `Toàn bộ Bảng (Trang ${activePage.pageNumber})`,
                    status: "idle",
                    selectedForScan: true,
                  };
                  try {
                    const thumb = await cropImageArea(activePage.imageUrl, fullTableCrop, { width: pW, height: pH });
                    fullTableCrop.croppedImageUrl = thumb;
                  } catch (_) {}
                  
                  const otherPageCrops = cropAreas.filter((c) => c.pageNumber !== activePage.pageNumber);
                  onChangeCropAreas([...otherPageCrops, fullTableCrop]);
                  if (onSelectCropId) onSelectCropId(fullTableCrop.id);
                }}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
                title="Tự động khoanh chọn toàn bộ phạm vi bảng trên trang hiện tại"
              >
                <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Chọn toàn bộ bảng trang này</span>
              </button>
            )}

            {/* Quick Action: Apply current crop to all other pages */}
            {activeCrop && pages.length > 1 && (
              <button
                type="button"
                onClick={() => handleCopyCropToAllPages(activeCrop)}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
                title={`Sao chép vị trí và kích thước của ${activeCrop.label} sang tất cả ${pages.length} trang`}
              >
                <CopyPlus className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sao chép vùng sang mọi trang</span>
              </button>
            )}

            {/* Quick Action: Scan selected area for columns if an active crop exists */}
            {activeCrop && onDetectColumnsFromCrop && (
              <button
                type="button"
                onClick={() => onDetectColumnsFromCrop(activeCrop)}
                disabled={isDetectingColumns || isScanning}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-colors disabled:opacity-40 cursor-pointer"
                title={`Quét nhận diện dòng tiêu đề & dòng 1 từ ${activeCrop.label}`}
              >
                <Columns3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Quét cột ({activeCrop.label})</span>
              </button>
            )}

            {/* Scan All / Selected Button & Stop OCR Button */}
            {isScanning ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={true}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs opacity-75 cursor-not-allowed select-none"
                  title="Đang trong tiến trình quét OCR"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  <span>Đang quét OCR</span>
                </button>
                {onStopScan && (
                  <button
                    type="button"
                    onClick={onStopScan}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xs transition-colors cursor-pointer"
                    title="Dừng toàn bộ tiến trình quét OCR ngay lập tức"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Dừng quét OCR (Stop)</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onScanAllAreas}
                disabled={selectedCrops.length === 0 || isScanning}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title={`Bắt đầu quét OCR cho ${selectedCrops.length} bảng đã được chọn`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Quét OCR ({selectedCrops.length} vùng đã chọn)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[560px] bg-slate-100/70 p-4 gap-4">
        {/* Left / Center: Interactive Canvas Page View inside Bento Container */}
        <div
          ref={containerRef}
          className="lg:col-span-8 bg-slate-300 rounded-2xl relative overflow-auto flex items-center justify-center border-4 border-white shadow-inner p-4 min-h-[500px] max-h-[620px] select-none"
        >
          <div
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
              transition: "transform 0.15s ease-out",
            }}
            className="relative shadow-2xl border border-slate-200 bg-white rounded-lg cursor-crosshair inline-block"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* Base Page Image */}
            <img
              ref={imageRef}
              src={activePage.imageUrl}
              alt={`Trang ${activePage.pageNumber}`}
              className={`max-w-none block pointer-events-none ${getFilterStyle()}`}
              style={{
                width: `${activePage.originalWidth || activePage.width / 2}px`,
                height: "auto",
              }}
              draggable={false}
            />

            {/* Render Existing Crop Areas for this Page */}
            {currentPageCrops.map((crop) => {
              const isSelected = activeCropId === crop.id;
              return (
                <div
                  key={crop.id}
                  style={{
                    left: `${crop.x}px`,
                    top: `${crop.y}px`,
                    width: `${crop.width}px`,
                    height: `${crop.height}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectCropId) onSelectCropId(crop.id);
                  }}
                  onMouseDown={(e) => startMovingCrop(crop, e)}
                  className={`absolute border-2 transition-all cursor-move ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-500/20 ring-2 ring-indigo-400"
                      : "border-indigo-400 border-dashed bg-indigo-50/40 hover:bg-indigo-100/40"
                  }`}
                >
                  {/* Badge */}
                  <div className="absolute -top-6 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-white bg-indigo-600 shadow-sm flex items-center gap-1.5 whitespace-nowrap z-10 pointer-events-none">
                    <span>{crop.label}</span>
                    {crop.status === "scanning" && (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-amber-300" />
                    )}
                    {crop.status === "success" && (
                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-300" />
                    )}
                    {crop.status === "error" && (
                      <AlertCircle className="w-2.5 h-2.5 text-red-300" />
                    )}
                  </div>

                  {/* Corner Resize Handles */}
                  <div
                    onMouseDown={(e) => startResizingCrop(crop, "nw", e)}
                    className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize z-10 shadow-xs"
                  />
                  <div
                    onMouseDown={(e) => startResizingCrop(crop, "ne", e)}
                    className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize z-10 shadow-xs"
                  />
                  <div
                    onMouseDown={(e) => startResizingCrop(crop, "sw", e)}
                    className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm cursor-nesw-resize z-10 shadow-xs"
                  />
                  <div
                    onMouseDown={(e) => startResizingCrop(crop, "se", e)}
                    className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-indigo-600 rounded-sm cursor-nwse-resize z-10 shadow-xs"
                  />

                  {/* Quick Delete button */}
                  <button
                    type="button"
                    onClick={(e) => handleRemoveCrop(crop.id, e)}
                    className="absolute -top-3 -right-3 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md cursor-pointer z-20"
                    title="Xóa vùng chọn này"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>

                  {/* Floating Action Bar when Selected */}
                  {isSelected && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-xs text-white p-1 rounded-lg shadow-lg z-30 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
                    >
                      {pages.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyCropToAllPages(crop);
                          }}
                          disabled={isScanning}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 hover:bg-slate-600 text-white transition-colors cursor-pointer disabled:opacity-50"
                          title="Sao chép kích thước & vị trí vùng này sang tất cả các trang khác"
                        >
                          <CopyPlus className="w-2.5 h-2.5 text-indigo-300" />
                          <span>Sao chép mọi trang</span>
                        </button>
                      )}
                      {onDetectColumnsFromCrop && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDetectColumnsFromCrop(crop);
                          }}
                          disabled={isDetectingColumns || isScanning}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                          title="Quét vùng này để tự động nhận diện các cột (Dòng tiêu đề + Dòng 1)"
                        >
                          <Columns3 className="w-2.5 h-2.5" />
                          <span>Quét cột</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onScanArea(crop);
                        }}
                        disabled={isScanning || crop.status === "scanning"}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                        title="Quét bóc toàn bộ dữ liệu bảng trong vùng này"
                      >
                        <Play className="w-2.5 h-2.5 fill-white" />
                        <span>Quét bảng</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Currently Drawing Box */}
            {isDrawing && currentDraw && (
              <div
                style={{
                  left: `${currentDraw.x}px`,
                  top: `${currentDraw.y}px`,
                  width: `${currentDraw.width}px`,
                  height: `${currentDraw.height}px`,
                }}
                className="absolute border-2 border-dashed border-indigo-600 bg-indigo-500/20 pointer-events-none"
              >
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-mono rounded">
                  {Math.round(currentDraw.width)} × {Math.round(currentDraw.height)} px
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar: Selected Crop Areas List & Actions */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between space-y-3 max-h-[620px] overflow-y-auto shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Crop className="w-3.5 h-3.5 text-indigo-600" />
                  Vùng quét ({cropAreas.length})
                </h3>
                {cropAreas.length > 0 && (
                  <label
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200"
                    title="Chọn tất cả hoặc bỏ chọn tất cả bảng cần quét OCR"
                  >
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer"
                    />
                    <span>Chọn tất ({selectedCrops.length}/{cropAreas.length})</span>
                  </label>
                )}
              </div>
              {cropAreas.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeCropAreas([])}
                  className="text-[11px] text-red-600 hover:underline cursor-pointer font-medium"
                >
                  Xóa tất cả
                </button>
              )}
            </div>

            {cropAreas.length === 0 ? (
              <div className="text-center py-8 px-3 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Crop className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">
                  Chưa chọn vùng bảng nào
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Nhấn và kéo chuột trên ảnh tài liệu bên trái để khoanh vùng bảng.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {cropAreas.map((crop, idx) => {
                  const isSelected = activeCropId === crop.id;
                  const isCurPage = crop.pageNumber === activePage.pageNumber;
                  const isCropChecked = crop.selectedForScan !== false;

                  return (
                    <div
                      key={crop.id}
                      onClick={() => {
                        if (onSelectCropId) onSelectCropId(crop.id);
                        if (!isCurPage) {
                          onSelectPageIndex(crop.pageNumber - 1);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-400"
                          : isCropChecked
                          ? "border-slate-200 bg-white hover:bg-slate-50"
                          : "border-slate-200 bg-slate-50/60 opacity-60 hover:opacity-90"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Checkbox for selective OCR */}
                        <div
                          className="pt-1"
                          onClick={(e) => handleToggleCropSelect(crop.id, e)}
                          title={isCropChecked ? "Bỏ chọn vùng này khỏi lần quét OCR" : "Chọn vùng này để quét OCR"}
                        >
                          <input
                            type="checkbox"
                            checked={isCropChecked}
                            onChange={() => {}}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                          />
                        </div>

                        {/* Thumbnail */}
                        {crop.croppedImageUrl ? (
                          <img
                            src={crop.croppedImageUrl}
                            alt={crop.label}
                            className="w-16 h-12 object-cover rounded-lg border border-slate-200 bg-slate-100 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-16 h-12 rounded-lg border border-slate-200 bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-400">
                            <Crop className="w-4 h-4" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-slate-800 truncate">
                              {crop.label}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                              Trang {crop.pageNumber}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                            {crop.status === "idle" && (
                              <span className="text-slate-400">Chưa quét OCR</span>
                            )}
                            {crop.status === "scanning" && (
                              <span className="text-amber-600 font-semibold flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Đang quét...
                              </span>
                            )}
                            {crop.status === "success" && (
                              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Đã bóc {crop.extractedRowCount || 0} dòng
                              </span>
                            )}
                            {crop.status === "error" && (
                              <span className="text-red-600 font-semibold flex items-center gap-1 truncate">
                                <AlertCircle className="w-3 h-3" />
                                Lỗi quét
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1">
                          {/* Reorder / Rearrange buttons */}
                          {cropAreas.length > 1 && (
                            <div className="flex flex-col gap-0.5 mr-0.5">
                              <button
                                type="button"
                                onClick={(e) => handleMoveCrop(idx, "up", e)}
                                disabled={idx === 0 || isScanning}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer rounded transition-colors"
                                title="Đẩy vùng quét lên trước (Tăng thứ tự ưu tiên)"
                              >
                                <MoveUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleMoveCrop(idx, "down", e)}
                                disabled={idx === cropAreas.length - 1 || isScanning}
                                className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer rounded transition-colors"
                                title="Đẩy vùng quét xuống sau"
                              >
                                <MoveDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {pages.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyCropToAllPages(crop);
                              }}
                              disabled={isScanning}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                              title="Sao chép vùng này sang tất cả các trang"
                            >
                              <CopyPlus className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {onDetectColumnsFromCrop && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDetectColumnsFromCrop(crop);
                              }}
                              disabled={isDetectingColumns || isScanning}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                              title="Quét nhận diện cột từ vùng này (Dòng tiêu đề + Dòng 1)"
                            >
                              <Columns3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {crop.status === "scanning" && onStopScan ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onStopScan();
                              }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Dừng quét vùng này"
                            >
                              <Square className="w-3.5 h-3.5 fill-rose-600" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onScanArea(crop);
                              }}
                              disabled={isScanning || crop.status === "scanning"}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
                              title="Quét OCR toàn bộ dữ liệu bảng trong vùng này"
                            >
                              <Play className="w-3.5 h-3.5 fill-emerald-600" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleRemoveCrop(crop.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa vùng"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick tips */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <p className="font-bold text-slate-700 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-indigo-600" />
              Gợi ý khoanh vùng:
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
              <li>Kéo khung bao trọn các dòng bảng và tiêu đề cột.</li>
              <li>Dùng nút phóng to hoặc Tăng nét khi tài liệu bị mờ.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
