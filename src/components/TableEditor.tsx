import React, { useState, useMemo, useRef, useEffect } from "react";
import { ColumnDef, TableRow, CropArea, ColumnType, DocumentPage } from "../types";
import { exportToExcel, exportToCSV, copyTableToClipboard } from "../utils/excelExport";
import { isDuplicateHeaderRow, removeDuplicateHeaderRows } from "../utils/tableHelper";
import {
  Table as TableIcon,
  Download,
  FileSpreadsheet,
  Copy,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Undo2,
  Redo2,
  Search,
  ArrowUpDown,
  FileCheck,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Move,
  Image as ImageIcon,
  MoveUp,
  MoveDown,
  CopyPlus,
  Eye,
  Sparkles,
  AlertTriangle,
  FileText,
  Filter,
  Ban,
  Scissors,
  CheckCheck,
  Layers,
} from "lucide-react";

interface TableEditorProps {
  columns: ColumnDef[];
  onChangeColumns: (cols: ColumnDef[]) => void;
  rows: TableRow[];
  onChangeRows: (rows: TableRow[]) => void;
  cropAreas: CropArea[];
  pages?: DocumentPage[];
  documentName?: string;
}

export const TableEditor: React.FC<TableEditorProps> = ({
  columns,
  onChangeColumns,
  rows,
  onChangeRows,
  cropAreas,
  pages = [],
  documentName = "bang_du_lieu_scanned",
}) => {
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: string;
  } | null>(null);
  const [cellTempText, setCellTempText] = useState("");

  const [selectedRowId, setSelectedRowId] = useState<string | null>(
    rows[0]?._id || null
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [exportFilename, setExportFilename] = useState(
    documentName.replace(/\.[^/.]+$/, "") || "bang_du_lieu_scanned"
  );
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [duplicateBannerMsg, setDuplicateBannerMsg] = useState<string | null>(null);

  // Synchronize exportFilename when documentName prop changes (e.g. user uploads a new file)
  useEffect(() => {
    if (documentName) {
      setExportFilename(documentName.replace(/\.[^/.]+$/, "") || "bang_du_lieu_scanned");
    }
  }, [documentName]);

  // Undo / Redo history
  const [history, setHistory] = useState<TableRow[][]>([rows]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Inspector toggle & Pan/Zoom states
  const [showCropInspector, setShowCropInspector] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isInspectorExpanded, setIsInspectorExpanded] = useState<boolean>(false);
  const [viewImageSource, setViewImageSource] = useState<"crop" | "page">("crop");

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handlePanMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanning(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handlePanMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePanMouseUp = () => {
    setIsPanning(false);
  };

  const handleInspectorWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoomLevel((prev) => Math.min(4, Math.max(0.5, Number((prev + delta).toFixed(2)))));
  };

  // Count detected duplicate headers
  const duplicateHeaderRows = useMemo(() => {
    return rows.filter((r) => isDuplicateHeaderRow(r, columns));
  }, [rows, columns]);

  // Save to history helper
  const pushState = (newRows: TableRow[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    updatedHistory.push(newRows);
    setHistory(updatedHistory);
    setHistoryIndex(updatedHistory.length - 1);
    onChangeRows(newRows);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      onChangeRows(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      onChangeRows(next);
    }
  };

  // Clear all entries with confirmation
  const handleClearAllRows = () => {
    pushState([]);
    setSelectedRowId(null);
    setShowClearConfirm(false);
  };

  // Remove duplicated header rows
  const handleRemoveDuplicateHeaders = () => {
    const { cleanRows, removedCount } = removeDuplicateHeaderRows(rows, columns);
    if (removedCount > 0) {
      pushState(cleanRows);
      setDuplicateBannerMsg(`Đã tự động loại bỏ ${removedCount} dòng tiêu đề bị lặp lại.`);
      setTimeout(() => setDuplicateBannerMsg(null), 4000);
    } else {
      setDuplicateBannerMsg("Không phát hiện thấy dòng tiêu đề lặp lại nào.");
      setTimeout(() => setDuplicateBannerMsg(null), 3000);
    }
  };

  // Start cell editing
  const startEditCell = (rowId: string, colKey: string, initialVal: any) => {
    setEditingCell({ rowId, colKey });
    setCellTempText(initialVal !== undefined && initialVal !== null ? String(initialVal) : "");
  };

  // Commit cell editing
  const saveEditCell = () => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;

    const newRows = rows.map((r) => {
      if (r._id === rowId) {
        return {
          ...r,
          [colKey]: cellTempText,
          _isModified: true,
        };
      }
      return r;
    });

    pushState(newRows);
    setEditingCell(null);
  };

  // Cancel cell editing
  const cancelEditCell = () => {
    setEditingCell(null);
  };

  // Row operations
  const handleAddRow = () => {
    const newRow: TableRow = {
      _id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      _isModified: true,
    };
    columns.forEach((c) => {
      newRow[c.key] = c.key === "stt" ? String(rows.length + 1) : "";
    });
    pushState([...rows, newRow]);
    setSelectedRowId(newRow._id);
  };

  const handleDeleteRow = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newRows = rows.filter((r) => r._id !== id);
    pushState(newRows);
    if (selectedRowId === id) {
      setSelectedRowId(newRows[0]?._id || null);
    }
  };

  const handleDuplicateRow = (row: TableRow, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const duplicated: TableRow = {
      ...row,
      _id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      _isModified: true,
    };
    const idx = rows.findIndex((r) => r._id === row._id);
    const newRows = [...rows];
    newRows.splice(idx + 1, 0, duplicated);
    pushState(newRows);
    setSelectedRowId(duplicated._id);
  };

  const handleMoveRow = (index: number, direction: "up" | "down", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= rows.length) return;

    const newRows = [...rows];
    const temp = newRows[index];
    newRows[index] = newRows[targetIdx];
    newRows[targetIdx] = temp;
    pushState(newRows);
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase().trim();
    return rows.filter((row) => {
      return columns.some((col) => {
        const val = String(row[col.key] || "").toLowerCase();
        return val.includes(q);
      });
    });
  }, [rows, searchQuery, columns]);

  // Selected row object and associated crop image
  const selectedRow = useMemo(() => {
    return rows.find((r) => r._id === selectedRowId) || rows[0] || null;
  }, [rows, selectedRowId]);

  const selectedCrop = useMemo(() => {
    if (!selectedRow?._cropId) return cropAreas[0] || null;
    return cropAreas.find((c) => c.id === selectedRow._cropId) || cropAreas[0] || null;
  }, [selectedRow, cropAreas]);

  // Column summaries (sum of numbers, count)
  const columnSummaries = useMemo(() => {
    const summaries: Record<string, { sum: number; count: number; isNumeric: boolean }> = {};
    columns.forEach((col) => {
      let isNumericCol = col.type === "number" || col.type === "currency";
      let sum = 0;
      let count = 0;

      rows.forEach((r) => {
        const val = r[col.key];
        if (val !== undefined && val !== null && val !== "") {
          count++;
          // Try parse numeric value ignoring dots/commas
          const cleanVal = String(val)
            .replace(/[^\d.-]/g, "")
            .replace(/\.(?=.*\.)/g, ""); // strip duplicate dots
          const parsed = parseFloat(cleanVal);
          if (!isNaN(parsed)) {
            sum += parsed;
          }
        }
      });

      summaries[col.key] = { sum, count, isNumeric: isNumericCol };
    });
    return summaries;
  }, [columns, rows]);

  const handleCopyClipboard = async () => {
    const ok = await copyTableToClipboard(columns, rows);
    if (ok) {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    }
  };

  const formatSummaryNumber = (num: number, type: ColumnType) => {
    if (type === "currency") {
      return new Intl.NumberFormat("vi-VN").format(Math.round(num)) + " đ";
    }
    return new Intl.NumberFormat("vi-VN").format(num);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col space-y-4 p-5">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
                3
              </span>
              <span>Xem trước &amp; Chỉnh sửa</span>
            </h3>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Chế độ chỉnh sửa tay
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {rows.length} dòng dữ liệu
            </span>
            {duplicateHeaderRows.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200 animate-pulse">
                <AlertTriangle className="w-3 h-3 text-rose-600" />
                Phát hiện {duplicateHeaderRows.length} dòng trùng tiêu đề
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kiểm tra đối chiếu văn bản tiếng Việt, nhấp đúp vào ô bất kỳ để chỉnh sửa trực tiếp trước khi xuất Excel.
          </p>
        </div>

        {/* Undo/Redo + Search + Data tools + Export actions */}
        <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-1.5 text-slate-600 hover:bg-white rounded-lg disabled:opacity-30 transition-colors cursor-pointer"
              title="Hoàn tác (Undo)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-1.5 text-slate-600 hover:bg-white rounded-lg disabled:opacity-30 transition-colors cursor-pointer"
              title="Làm lại (Redo)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Remove duplicate headers button */}
          <button
            type="button"
            onClick={handleRemoveDuplicateHeaders}
            disabled={rows.length === 0}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer shadow-2xs ${
              duplicateHeaderRows.length > 0
                ? "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-40"
            }`}
            title="Tự động kiểm tra và lọc bỏ các dòng chứa tên cột / dòng tiêu đề lặp lại"
          >
            <Scissors className="w-3.5 h-3.5 text-rose-600" />
            <span>Lọc trùng tiêu đề {duplicateHeaderRows.length > 0 ? `(${duplicateHeaderRows.length})` : ""}</span>
          </button>

          {/* Clear All Rows Button with Confirmation */}
          <div className="relative">
            {showClearConfirm ? (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 rounded-xl p-1 shadow-md z-20">
                <span className="text-[11px] font-bold text-rose-700 pl-1">Xác nhận xóa hết?</span>
                <button
                  type="button"
                  onClick={handleClearAllRows}
                  className="px-2 py-0.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors cursor-pointer"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="px-2 py-0.5 text-xs font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={rows.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
                title="Xóa toàn bộ dòng dữ liệu trong bảng kết quả"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Xóa tất cả</span>
              </button>
            )}
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm dòng..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none w-36 sm:w-44 shadow-2xs"
            />
          </div>

          {/* Toggle Inspector */}
          <button
            type="button"
            onClick={() => setShowCropInspector(!showCropInspector)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer shadow-2xs ${
              showCropInspector
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
            }`}
            title="Bật/Tắt khung đối chiếu tài liệu quét gốc"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            <span>Đối chiếu ảnh gốc</span>
          </button>

          {/* Copy TSV */}
          <button
            type="button"
            onClick={handleCopyClipboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
            title="Sao chép bảng để dán vào Excel / Google Sheets"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            <span>{copiedNotification ? "Đã sao chép!" : "Sao chép"}</span>
          </button>

          {/* Filename Editor */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1.5 hidden sm:inline whitespace-nowrap">
              Tên file:
            </span>
            <input
              type="text"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              placeholder="Tên file xuất..."
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none w-32 sm:w-44 truncate"
              title="Nhập tên tệp xuất ra (mặc định lấy theo tên tài liệu gốc)"
            />
            <span className="text-[10px] font-mono text-slate-400">.xlsx/.csv</span>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={() => exportToCSV(columns, rows, `${exportFilename || "bang_du_lieu"}.csv`)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors disabled:opacity-40 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Xuất CSV</span>
          </button>

          {/* Export Excel (.xlsx) */}
          <button
            type="button"
            onClick={() => exportToExcel(columns, rows, `${exportFilename || "bang_du_lieu"}.xlsx`)}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors disabled:opacity-40 cursor-pointer"
            title="Xuất file bảng tính Excel (.xlsx) hỗ trợ đầy đủ font chữ tiếng Việt Unicode"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Duplicate Header Warning Banner if detected */}
      {duplicateBannerMsg && (
        <div className="px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-medium text-indigo-800 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>{duplicateBannerMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setDuplicateBannerMsg(null)}
            className="text-indigo-400 hover:text-indigo-700 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {duplicateHeaderRows.length > 0 && !duplicateBannerMsg && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              Phát hiện <strong>{duplicateHeaderRows.length} dòng</strong> có nội dung trùng lặp với tiêu đề cột (thường do OCR quét lặp dòng header giữa các trang).
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemoveDuplicateHeaders}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Lọc bỏ {duplicateHeaderRows.length} dòng tiêu đề ngay</span>
          </button>
        </div>
      )}

      {/* Main Grid View & Inspection Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Rich Spreadsheet Table */}
        <div
          className={`${
            showCropInspector ? "lg:col-span-8" : "lg:col-span-12"
          } space-y-3 transition-all`}
        >
          {/* Table Container */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                {/* Table Header */}
                <thead className="bg-slate-100/90 text-slate-700 sticky top-0 z-10 border-b border-slate-200 shadow-2xs">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center font-bold text-slate-500 border-r border-slate-200">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col.id}
                        className="px-3 py-2.5 font-bold text-slate-800 border-r border-slate-200 whitespace-nowrap min-w-[120px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{col.name}</span>
                          <span className="text-[10px] font-mono font-normal text-slate-400">
                            {col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 w-20 text-center font-bold text-slate-500">
                      Thao tác
                    </th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-slate-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="py-12 text-center text-slate-400"
                      >
                        {rows.length === 0
                          ? "Chưa có dữ liệu. Vui lòng chọn vùng quét và nhấn 'Quét OCR' ở Bước 2."
                          : "Không tìm thấy dòng phù hợp với từ khóa tìm kiếm."}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, rowIdx) => {
                      const isSelected = selectedRowId === row._id;
                      const isDupHeader = isDuplicateHeaderRow(row, columns);

                      return (
                        <tr
                          key={row._id}
                          onClick={() => setSelectedRowId(row._id)}
                          className={`group transition-colors ${
                            isSelected
                              ? "bg-indigo-50/80 ring-1 ring-inset ring-indigo-300"
                              : isDupHeader
                              ? "bg-rose-50/70 hover:bg-rose-100/60"
                              : row._isModified
                              ? "bg-amber-50/50 hover:bg-slate-50"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          {/* Row Number */}
                          <td className="px-3 py-2 text-center font-mono text-[11px] text-slate-400 border-r border-slate-200 select-none">
                            {isDupHeader ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-200 text-rose-800" title="Dòng này trùng tiêu đề cột">
                                Header
                              </span>
                            ) : (
                              rowIdx + 1
                            )}
                          </td>

                          {/* Editable Cells */}
                          {columns.map((col) => {
                            const isEditing =
                              editingCell?.rowId === row._id &&
                              editingCell?.colKey === col.key;
                            const cellValue = row[col.key];

                            return (
                              <td
                                key={col.id}
                                onDoubleClick={() =>
                                  startEditCell(row._id, col.key, cellValue)
                                }
                                className="px-3 py-1.5 border-r border-slate-200 text-slate-800 relative"
                              >
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={cellTempText}
                                      onChange={(e) =>
                                        setCellTempText(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveEditCell();
                                        if (e.key === "Escape") cancelEditCell();
                                      }}
                                      className="w-full px-2 py-1 text-xs bg-white border-2 border-indigo-500 rounded-md focus:outline-none shadow-sm"
                                    />
                                    <button
                                      type="button"
                                      onClick={saveEditCell}
                                      className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                      title="Lưu"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditCell}
                                      className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 cursor-pointer"
                                      title="Hủy"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    onClick={() =>
                                      startEditCell(row._id, col.key, cellValue)
                                    }
                                    className="cursor-text min-h-[22px] flex items-center justify-between rounded px-1.5 py-0.5 hover:bg-slate-200/60"
                                    title="Nhấp đúp hoặc nhấp để chỉnh sửa ô"
                                  >
                                    <span
                                      className={
                                        col.type === "number" || col.type === "currency"
                                          ? "font-mono font-medium text-slate-900"
                                          : ""
                                      }
                                    >
                                      {cellValue !== undefined && cellValue !== null && cellValue !== ""
                                        ? String(cellValue)
                                        : <span className="text-slate-300 italic text-[11px]">—</span>}
                                    </span>
                                    <Edit2 className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" />
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* Row Actions */}
                          <td className="px-3 py-1.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => handleMoveRow(rowIdx, "up", e)}
                                disabled={rowIdx === 0}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                title="Di chuyển dòng lên"
                              >
                                <MoveUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleMoveRow(rowIdx, "down", e)}
                                disabled={rowIdx === rows.length - 1}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                title="Di chuyển dòng xuống"
                              >
                                <MoveDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDuplicateRow(row, e)}
                                className="p-1 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                title="Nhân đôi dòng này"
                              >
                                <CopyPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteRow(row._id, e)}
                                className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                title="Xóa dòng này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Table Summary Footer */}
                {rows.length > 0 && (
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 sticky bottom-0 z-10 shadow-sm">
                    <tr>
                      <td className="px-3 py-2.5 text-center text-slate-500 font-mono text-[11px] border-r border-slate-200">
                        Σ
                      </td>
                      {columns.map((col) => {
                        const summary = columnSummaries[col.key];
                        return (
                          <td
                            key={col.id}
                            className="px-3 py-2.5 border-r border-slate-200 font-mono text-xs text-slate-800"
                          >
                            {summary?.isNumeric && summary.sum > 0 ? (
                              <div className="flex flex-col">
                                <span className="text-slate-900">
                                  {formatSummaryNumber(summary.sum, col.type)}
                                </span>
                                <span className="text-[10px] font-normal text-slate-400">
                                  {summary.count} giá trị
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-normal text-[11px]">
                                {summary?.count || 0} mục
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center text-slate-500 text-[11px]">
                        {rows.length} dòng
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Add Row Button & Quick Tips */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm dòng mới
            </button>

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
              <span>Dòng màu vàng nhạt là dòng đã chỉnh sửa thủ công.</span>
            </div>
          </div>
        </div>

        {/* Right: Side-by-Side Original Document Crop Inspector */}
        {showCropInspector && (
          <div className={`bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col space-y-3 shadow-2xs transition-all ${
            isInspectorExpanded ? "lg:col-span-12" : "lg:col-span-4"
          }`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <FileCheck className="w-4 h-4 text-indigo-600" />
                  Đối chiếu tài liệu gốc
                </h3>
                <span className="text-[11px] font-medium text-slate-500 truncate max-w-[140px]">
                  {selectedCrop ? selectedCrop.label : "Vùng quét"}
                </span>
              </div>

              {/* View mode toggle (Crop zone vs Full page) */}
              <div className="flex items-center gap-1">
                {pages.length > 0 && (
                  <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setViewImageSource("crop");
                        handleResetZoom();
                      }}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        viewImageSource === "crop"
                          ? "bg-white text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Vùng cắt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setViewImageSource("page");
                        handleResetZoom();
                      }}
                      className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                        viewImageSource === "page"
                          ? "bg-white text-indigo-700 shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Toàn trang
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setIsInspectorExpanded(!isInspectorExpanded)}
                  className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  title={isInspectorExpanded ? "Thu nhỏ khung đối chiếu" : "Mở rộng khung đối chiếu"}
                >
                  {isInspectorExpanded ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Main Interactive Pan & Zoom Area */}
            {(() => {
              const activePageImg = pages.find((p) => p.pageNumber === (selectedCrop?.pageNumber || 1))?.imageUrl;
              const displayImg = viewImageSource === "page" ? (activePageImg || selectedCrop?.croppedImageUrl) : (selectedCrop?.croppedImageUrl || activePageImg);

              if (!displayImg) {
                return (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Chưa có ảnh vùng quét đối chiếu.
                  </div>
                );
              }

              return (
                <div className="space-y-2.5">
                  {/* Pan & Zoom Toolbar */}
                  <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Move className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                      <span className="text-[11px] font-medium hidden sm:inline text-slate-500">Pan &amp; Zoom</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleZoomOut}
                        disabled={zoomLevel <= 0.5}
                        className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 cursor-pointer transition-colors"
                        title="Thu nhỏ (-)"
                      >
                        <ZoomOut className="w-3.5 h-3.5" />
                      </button>

                      <span className="font-mono text-[11px] font-bold text-slate-700 w-12 text-center select-none">
                        {Math.round(zoomLevel * 100)}%
                      </span>

                      <button
                        type="button"
                        onClick={handleZoomIn}
                        disabled={zoomLevel >= 4}
                        className="p-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30 cursor-pointer transition-colors"
                        title="Phóng to (+)"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                      </button>

                      <div className="h-4 w-px bg-slate-200 mx-1" />

                      <button
                        type="button"
                        onClick={handleResetZoom}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                        title="Đặt lại vị trí & độ phóng to gốc"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Đặt lại</span>
                      </button>
                    </div>
                  </div>

                  {/* Pan-Zoom Interactive Viewport */}
                  <div
                    onMouseDown={handlePanMouseDown}
                    onMouseMove={handlePanMouseMove}
                    onMouseUp={handlePanMouseUp}
                    onMouseLeave={handlePanMouseUp}
                    onWheel={handleInspectorWheel}
                    className={`relative border border-slate-300 rounded-xl overflow-hidden bg-slate-900 shadow-inner select-none flex items-center justify-center cursor-grab active:cursor-grabbing transition-[height] duration-200 ${
                      isInspectorExpanded ? "h-96 sm:h-[460px]" : "h-72"
                    }`}
                  >
                    <div
                      className="transition-transform duration-75 ease-out will-change-transform flex items-center justify-center"
                      style={{
                        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                        transformOrigin: "center center",
                      }}
                    >
                      <img
                        src={displayImg}
                        alt="Tài liệu đối chiếu"
                        className="max-w-none pointer-events-none rounded shadow-md"
                        draggable={false}
                      />
                    </div>

                    {/* Hint overlay badge */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-xs text-[10px] text-slate-300 pointer-events-none flex items-center gap-1.5 border border-white/10">
                      <span>Kéo chuột để di chuyển • Cuộn để phóng to/nhỏ</span>
                    </div>
                  </div>

                  {/* Selected Row Value Comparison Inspector */}
                  {selectedRow && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2 text-xs shadow-2xs">
                      <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center justify-between">
                        <span>Dòng đang chọn (STT: {selectedRow.stt || "—"})</span>
                        <span className="text-[10px] text-indigo-600 font-mono">
                          {columns.length} cột
                        </span>
                      </div>

                      <div className="space-y-1 max-h-40 overflow-y-auto divide-y divide-slate-100">
                        {columns.map((c) => (
                          <div
                            key={c.id}
                            className="pt-1 flex items-start justify-between gap-2 text-[11px]"
                          >
                            <span className="text-slate-500 truncate font-medium">
                              {c.name}:
                            </span>
                            <span className="font-mono font-semibold text-slate-900 text-right select-all">
                              {selectedRow[c.key] || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-[11px] text-emerald-800 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <p>
                      <strong>Tiếng Việt 100% nguyên bản:</strong> Hệ thống OCR giữ nguyên vẹn toàn bộ dấu thanh điệu, ký tự số và dấu phân cách.
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};
