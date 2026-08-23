import React, { useState, useRef } from "react";
import { DocumentPage } from "../types";
import { loadPdfPages, loadImagePage, generateSampleDocument } from "../utils/pdfHelper";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  FileUp,
  Receipt,
  Boxes,
  Users,
  ChevronDown,
  ChevronRight,
  FolderOpen,
} from "lucide-react";

interface DocumentUploaderProps {
  onDocumentLoaded: (pages: DocumentPage[], filename: string) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  loadedFilename?: string;
  pageCount?: number;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  onDocumentLoaded,
  isLoading,
  setIsLoading,
  loadedFilename,
  pageCount = 0,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSamplesOpen, setIsSamplesOpen] = useState(false); // Collapsed by default
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pages = await loadPdfPages(file);
        if (pages.length === 0) {
          throw new Error("Không thể trích xuất trang nào từ file PDF này.");
        }
        onDocumentLoaded(pages, file.name);
      } else if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name)) {
        const page = await loadImagePage(file);
        onDocumentLoaded([page], file.name);
      } else {
        throw new Error("Định dạng file không hỗ trợ. Vui lòng tải lên file PDF hoặc Hình ảnh (PNG, JPG).");
      }
    } catch (err: any) {
      console.error("File loading error:", err);
      setErrorMessage(err.message || "Đã xảy ra lỗi khi đọc file.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const loadSample = (type: "invoice" | "inventory" | "payroll", name: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setTimeout(() => {
      try {
        const pages = generateSampleDocument(type);
        onDocumentLoaded(pages, `${name}.pdf`);
      } catch (e: any) {
        setErrorMessage("Lỗi khi tải tài liệu mẫu.");
      } finally {
        setIsLoading(false);
      }
    }, 150);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-1">
            <FileUp className="w-4 h-4 text-indigo-600" />
            <span>Nạp tài liệu PDF / Bản quét tiếng Việt</span>
          </h2>
          <p className="text-xs text-slate-500">
            Hỗ trợ file PDF đa trang hoặc ảnh quét văn bản tiếng Việt độ phân giải cao để nhận diện bảng.
          </p>
        </div>

        {loadedFilename && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-800 truncate max-w-[200px]">
              {loadedFilename}
            </span>
            <span className="text-slate-400">({pageCount} trang)</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-indigo-600 hover:text-indigo-800 font-semibold ml-1 cursor-pointer"
            >
              Đổi file
            </button>
          </div>
        )}
      </div>

      {/* Primary Upload Drop Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[130px] ${
          dragOver
            ? "border-indigo-500 bg-indigo-50/70 ring-4 ring-indigo-500/10"
            : "border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/20"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold">Đang xử lý tài liệu...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Nhấp để chọn file hoặc kéo thả tài liệu vào đây
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Định dạng: PDF đa trang, PNG, JPG, WebP (tối đa 50MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Sample Documents Pane (Collapsed by Default) */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 transition-all">
        <button
          type="button"
          onClick={() => setIsSamplesOpen(!isSamplesOpen)}
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-100/80 transition-colors text-left cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-xs font-bold text-slate-700">
              Tài liệu tiếng Việt mẫu (Thử nghiệm ngay)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-semibold">
              3 tài liệu mẫu
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>{isSamplesOpen ? "Thu gọn" : "Xem tài liệu mẫu"}</span>
            {isSamplesOpen ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </button>

        {/* Collapsible Content */}
        {isSamplesOpen && (
          <div className="p-3.5 border-t border-slate-200/80 bg-white space-y-2">
            <p className="text-[11px] text-slate-500 mb-2">
              Chọn 1 trong các tài liệu mẫu chuẩn tiếng Việt bên dưới để thử nghiệm nhận diện bảng:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => loadSample("invoice", "Hoa_don_GTGT_Anh_Duong")}
                disabled={isLoading}
                className="flex items-start gap-2.5 p-3 text-left rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-xs text-slate-800 transition-all cursor-pointer shadow-2xs group"
              >
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block truncate text-slate-900 group-hover:text-indigo-700">
                    Hóa đơn GTGT Bán hàng
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                    6 dòng • Laptop, Màn hình 4K...
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => loadSample("inventory", "Bang_ke_vat_tu_ton_kho")}
                disabled={isLoading}
                className="flex items-start gap-2.5 p-3 text-left rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-xs text-slate-800 transition-all cursor-pointer shadow-2xs group"
              >
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Boxes className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block truncate text-slate-900 group-hover:text-indigo-700">
                    Bảng kê Vật tư Tồn kho
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                    8 dòng • Xi măng, Thép Hòa Phát...
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => loadSample("payroll", "Bang_thanh_toan_luong_phu_cap")}
                disabled={isLoading}
                className="flex items-start gap-2.5 p-3 text-left rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-xs text-slate-800 transition-all cursor-pointer shadow-2xs group"
              >
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="font-bold block truncate text-slate-900 group-hover:text-indigo-700">
                    Bảng Lương &amp; Phụ cấp
                  </span>
                  <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                    6 nhân sự • CTO, Kỹ sư AI...
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
