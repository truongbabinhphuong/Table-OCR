import React, { useState } from "react";
import { ColumnDef, ColumnType, VietnamesePreset, DocumentPage, CropArea } from "../types";
import { VIETNAMESE_PRESETS } from "../data/presets";
import {
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Check,
  ChevronUp,
  ChevronDown,
  Info,
  HelpCircle,
  Tag,
  Hash,
  Calendar,
  DollarSign,
  FileText,
  Square,
  Loader2,
  Scan,
  Crop,
  Columns3,
  MousePointer,
  Crosshair,
} from "lucide-react";

interface ColumnManagerProps {
  columns: ColumnDef[];
  onChangeColumns: (newCols: ColumnDef[]) => void;
  activePage?: DocumentPage;
  activeCropArea?: CropArea;
  cropAreas?: CropArea[];
  onSelectCropId?: (id: string) => void;
  onAutoDetectFromPage?: () => void;
  onDetectFromCropArea?: (crop?: CropArea) => void;
  onStopAutoDetect?: () => void;
  isDetecting?: boolean;
}

export const ColumnManager: React.FC<ColumnManagerProps> = ({
  columns,
  onChangeColumns,
  activePage,
  activeCropArea,
  cropAreas = [],
  onSelectCropId,
  onAutoDetectFromPage,
  onDetectFromCropArea,
  onStopAutoDetect,
  isDetecting = false,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState<ColumnType>("text");
  const [newColDesc, setNewColDesc] = useState("");
  const [recognitionMode, setRecognitionMode] = useState<"manual" | "auto">("manual");

  const currentPageCrops = cropAreas.filter(
    (c) => activePage && c.pageNumber === activePage.pageNumber
  );

  const sanitizeKey = (name: string): string => {
    // Generate camelCase alphanumeric key from Vietnamese string
    const normalized = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .map((word, idx) =>
        idx === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join("");

    return normalized || `col_${Date.now().toString().slice(-4)}`;
  };

  const handleAddColumn = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newColName.trim()) return;

    const baseKey = sanitizeKey(newColName);
    let uniqueKey = baseKey;
    let counter = 1;
    while (columns.some((c) => c.key === uniqueKey)) {
      uniqueKey = `${baseKey}_${counter++}`;
    }

    const newCol: ColumnDef = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newColName.trim(),
      key: uniqueKey,
      type: newColType,
      description: newColDesc.trim() || undefined,
    };

    onChangeColumns([...columns, newCol]);
    setNewColName("");
    setNewColDesc("");
  };

  const handleRemoveColumn = (id: string) => {
    if (columns.length <= 1) {
      alert("Bảng cần tối thiểu ít nhất 1 cột.");
      return;
    }
    onChangeColumns(columns.filter((c) => c.id !== id));
  };

  const handleUpdateColumn = (
    id: string,
    updates: Partial<Omit<ColumnDef, "id">>
  ) => {
    onChangeColumns(
      columns.map((c) => {
        if (c.id === id) {
          const updated = { ...c, ...updates };
          if (updates.name && (!updates.key || updates.key === c.key)) {
            // keep key or update if wanted
          }
          return updated;
        }
        return c;
      })
    );
  };

  const handleMoveColumn = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const updated = [...columns];
    const temp = updated[index];
    updated[index] = updated[newIndex];
    updated[newIndex] = temp;
    onChangeColumns(updated);
  };

  const handleApplyPreset = (preset: VietnamesePreset) => {
    const newCols: ColumnDef[] = preset.columns.map((col, idx) => ({
      id: `col-preset-${Date.now()}-${idx}`,
      name: col.name,
      key: col.key,
      type: col.type,
      description: col.description,
    }));
    onChangeColumns(newCols);
    setSelectedPresetId(preset.id);
  };

  const getTypeIcon = (type: ColumnType) => {
    switch (type) {
      case "number":
        return <Hash className="w-4 h-4 text-emerald-600" />;
      case "currency":
        return <DollarSign className="w-4 h-4 text-amber-600" />;
      case "date":
        return <Calendar className="w-4 h-4 text-blue-600" />;
      case "code":
        return <Tag className="w-4 h-4 text-purple-600" />;
      default:
        return <FileText className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
      {/* Header & Section Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                1
              </span>
              <span>Cấu hình cột (Column Definition)</span>
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              Quét dòng tiêu đề &amp; dòng 1
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Khai báo cấu trúc cột bảng. Sử dụng tính năng quét thủ công theo vùng hoặc tự động toàn trang để nhận diện tiêu đề &amp; dòng 1.
          </p>
        </div>

        {/* Global Stop AI Indicator if running */}
        {isDetecting && onStopAutoDetect && (
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              <span>Đang nhận diện tiêu đề &amp; dòng 1...</span>
            </div>
            <button
              type="button"
              onClick={onStopAutoDetect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
              title="Dừng thao tác nhận diện cột AI ngay lập tức"
            >
              <Square className="w-3.5 h-3.5 fill-white" />
              <span>Dừng AI (Stop)</span>
            </button>
          </div>
        )}
      </div>

      {/* Recognition Mode Selector & Action Area */}
      <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-slate-50/50 to-emerald-50/40 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs w-fit">
            <button
              type="button"
              onClick={() => setRecognitionMode("manual")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                recognitionMode === "manual"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
              <span>Quét thủ công theo vùng (Manual)</span>
            </button>
            <button
              type="button"
              onClick={() => setRecognitionMode("auto")}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                recognitionMode === "auto"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Quét tự động toàn trang (Auto)</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            {recognitionMode === "manual" ? (
              <span className="text-indigo-700 font-semibold flex items-center gap-1">
                <Crosshair className="w-3.5 h-3.5" />
                Khoanh chuẩn xác dòng tiêu đề + dòng dữ liệu 1
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                AI tự tìm bảng trên trang {activePage ? activePage.pageNumber : ""}
              </span>
            )}
          </div>
        </div>

        {recognitionMode === "manual" ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {activeCropArea ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <Crop className="w-3 h-3 text-indigo-600" />
                    Vùng đang chọn: {activeCropArea.label || "Vùng quét"} (Trang {activeCropArea.pageNumber})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    <MousePointer className="w-3 h-3 text-amber-600" />
                    Chưa chọn vùng khoanh (Hãy kéo chuột khoanh vùng trên ảnh tài liệu bên dưới)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600">
                Khoanh vùng chứa <strong>dòng tiêu đề</strong> và <strong>dòng dữ liệu đầu tiên</strong> bên dưới để AI phân tích tên cột và kiểu dữ liệu (Số, Tiền, Ngày, Mã).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {currentPageCrops.length > 0 && !activeCropArea && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Chọn nhanh:</span>
                  {currentPageCrops.slice(0, 3).map((crop) => (
                    <button
                      key={crop.id}
                      type="button"
                      onClick={() => onSelectCropId && onSelectCropId(crop.id)}
                      className="px-2 py-1 bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200 rounded text-[11px] font-semibold cursor-pointer shadow-2xs"
                    >
                      {crop.label}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => onDetectFromCropArea && onDetectFromCropArea(activeCropArea)}
                disabled={isDetecting || !activeCropArea}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
                title="Quét dòng tiêu đề & dòng 1 từ vùng đang chọn"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>Quét tiêu đề &amp; dòng 1 từ vùng chọn</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-slate-600">
              AI sẽ quét toàn bộ ảnh của <strong>Trang {activePage?.pageNumber || 1}</strong> để tự động tìm vùng bảng, đọc dòng tiêu đề và suy luận các cột tương ứng.
            </p>
            <button
              type="button"
              onClick={onAutoDetectFromPage}
              disabled={isDetecting || !activePage}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
              title="Quét toàn trang để AI tự tìm tiêu đề & dòng 1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Quét tự động toàn trang</span>
            </button>
          </div>
        )}
      </div>

      {/* Preset Quick Select Pills */}
      <div>
        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-slate-500" />
          Mẫu bảng sẵn có (Presets):
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {VIETNAMESE_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className={`text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20"
                    : "border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between font-bold text-slate-800 text-[12px] mb-0.5">
                  <span>{preset.title}</span>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                  )}
                </div>
                <div className="text-[10px] font-medium text-slate-400 truncate">
                  {preset.columns.length} cột: {preset.columns.map((c) => c.name).join(", ")}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bento Active Columns Chips Bar */}
      <div>
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
          <span>Các cột đang hoạt động ({columns.length}):</span>
          <span className="text-[10px] text-slate-400 font-normal lowercase">kéo hoặc chỉnh sửa bên dưới</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {columns.map((col, idx) => (
            <span
              key={col.id}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200 shadow-2xs"
            >
              <span className="text-indigo-400 font-mono text-[10px]">#{idx + 1}</span>
              <span>{col.name}</span>
              <span className="text-[10px] font-normal text-indigo-500 font-mono">({col.type})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Columns List Detailed Table */}
      <div className="space-y-2">
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-100/90 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
            <div className="col-span-1 text-center">STT</div>
            <div className="col-span-5">Tên Cột (Hiển thị & Xuất Excel)</div>
            <div className="col-span-3">Kiểu Dữ Liệu</div>
            <div className="col-span-2">Mã Khóa (Key)</div>
            <div className="col-span-1 text-right">Xóa</div>
          </div>

          <div className="divide-y divide-slate-200/80 max-h-56 overflow-y-auto">
            {columns.map((col, idx) => (
              <div
                key={col.id}
                className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center bg-white hover:bg-slate-50/80 transition-colors text-xs"
              >
                {/* STT & Sort buttons */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  <span className="text-slate-400 font-mono text-[11px]">
                    {idx + 1}
                  </span>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveColumn(idx, "up")}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === columns.length - 1}
                      onClick={() => handleMoveColumn(idx, "down")}
                      className="text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Column Name */}
                <div className="col-span-5">
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) =>
                      handleUpdateColumn(col.id, { name: e.target.value })
                    }
                    className="w-full px-2.5 py-1 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-indigo-500 focus:outline-none"
                    placeholder="Tên cột tiếng Việt..."
                  />
                </div>

                {/* Type */}
                <div className="col-span-3">
                  <div className="relative flex items-center">
                    <div className="absolute left-2 pointer-events-none">
                      {getTypeIcon(col.type)}
                    </div>
                    <select
                      value={col.type}
                      onChange={(e) =>
                        handleUpdateColumn(col.id, {
                          type: e.target.value as ColumnType,
                        })
                      }
                      className="w-full pl-7 pr-2 py-1 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="text">Văn bản (Text)</option>
                      <option value="number">Số lượng (Number)</option>
                      <option value="currency">Tiền tệ (VNĐ)</option>
                      <option value="date">Ngày tháng (Date)</option>
                      <option value="code">Mã hiệu / ID</option>
                    </select>
                  </div>
                </div>

                {/* Key */}
                <div className="col-span-2">
                  <input
                    type="text"
                    value={col.key}
                    onChange={(e) =>
                      handleUpdateColumn(col.id, { key: e.target.value })
                    }
                    className="w-full px-2 py-1 text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:border-indigo-500 focus:outline-none"
                    placeholder="colKey"
                  />
                </div>

                {/* Actions */}
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(col.id)}
                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    title="Xóa cột"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add New Column Input Bar */}
      <form
        onSubmit={handleAddColumn}
        className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200"
      >
        <div className="flex-1">
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Nhập tên cột mới (ví dụ: Đơn Vị, Đơn Giá, Ghi Chú)..."
            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="w-full sm:w-40">
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as ColumnType)}
            className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none cursor-pointer"
          >
            <option value="text">Văn bản (Text)</option>
            <option value="number">Số lượng (Number)</option>
            <option value="currency">Tiền tệ (VNĐ)</option>
            <option value="date">Ngày tháng (Date)</option>
            <option value="code">Mã hiệu / ID</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!newColName.trim()}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          + Thêm cột
        </button>
      </form>
    </div>
  );
};
