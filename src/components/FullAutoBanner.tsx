import React from "react";
import { DocumentPage, ColumnDef, CropArea } from "../types";
import {
  Sparkles,
  Zap,
  Play,
  Square,
  CheckCircle2,
  Loader2,
  Layers,
  Columns3,
  Scissors,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  HelpCircle,
  Clock,
} from "lucide-react";

interface FullAutoBannerProps {
  pages: DocumentPage[];
  cropAreas: CropArea[];
  columns: ColumnDef[];
  isFullAutoRunning: boolean;
  fullAutoStep: string;
  fullAutoProgress: number; // 0 - 100
  isSemiAutoMode: boolean;
  onToggleSemiAutoMode: (val: boolean) => void;
  isWaitingSemiAutoReview: boolean;
  onResumeSemiAuto: () => void;
  onCancelSemiAuto: () => void;
  onStartFullAuto: () => void;
  onStopFullAuto: () => void;
}

export const FullAutoBanner: React.FC<FullAutoBannerProps> = ({
  pages,
  cropAreas,
  columns,
  isFullAutoRunning,
  fullAutoStep,
  fullAutoProgress,
  isSemiAutoMode,
  onToggleSemiAutoMode,
  isWaitingSemiAutoReview,
  onResumeSemiAuto,
  onCancelSemiAuto,
  onStartFullAuto,
  onStopFullAuto,
}) => {
  return (
    <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl p-5 shadow-md border border-indigo-700/50 relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
              <Zap className="w-3 h-3 fill-amber-300" />
              {isSemiAutoMode ? "Chế độ Bán tự động (Semi-Auto)" : "Chế độ Tự động Toàn phần (Full-Auto)"}
            </span>
            <span className="text-xs text-indigo-200">
              {pages.length} trang tài liệu sẵn sàng
            </span>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <span>Bóc tách bảng dữ liệu 1-Chạm bằng Gemini AI</span>
          </h2>

          <p className="text-xs text-indigo-100/80 leading-relaxed">
            Hệ thống tự động thực hiện trọn gói 4 bước: <strong>Nhận diện tên &amp; kiểu cột</strong> ➔{" "}
            <strong>Khoanh vùng bảng mọi trang</strong> ➔ <strong>Quét OCR toàn bộ</strong> ➔{" "}
            <strong>Tự động lọc bỏ các dòng tiêu đề bị lặp lại</strong>.
          </p>

          {/* Semi-Auto Checkbox Toggle */}
          <div className="pt-0.5">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-indigo-100 bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-xl border border-white/15 cursor-pointer select-none transition-colors">
              <input
                type="checkbox"
                checked={isSemiAutoMode}
                onChange={(e) => onToggleSemiAutoMode(e.target.checked)}
                disabled={isFullAutoRunning}
                className="rounded text-amber-400 focus:ring-amber-400 w-3.5 h-3.5 cursor-pointer accent-amber-400"
              />
              <span className="font-semibold text-white">Chế độ Bán tự động:</span>
              <span className="text-indigo-200 text-[11px]">
                Dừng sau khi nhận diện cột để bạn xem &amp; chỉnh sửa cột (nếu cần) trước khi tiếp tục
              </span>
            </label>
          </div>

          {/* Pipeline Mini Stages */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
              isWaitingSemiAutoReview
                ? "bg-amber-400/20 text-amber-200 border-amber-400/40 font-bold"
                : "text-indigo-200/90 bg-white/5 border-white/10"
            }`}>
              <Columns3 className="w-3.5 h-3.5 text-amber-300 flex-shrink-0" />
              <span>1. Quét nhận diện cột</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-200/90 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
              <Layers className="w-3.5 h-3.5 text-cyan-300 flex-shrink-0" />
              <span>2. Phân vùng các trang</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-200/90 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-emerald-300 flex-shrink-0" />
              <span>3. Quét OCR dữ liệu</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-200/90 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
              <Scissors className="w-3.5 h-3.5 text-rose-300 flex-shrink-0" />
              <span>4. Lọc bỏ trùng lặp</span>
            </div>
          </div>
        </div>

        {/* Action Controls & Realtime Progress */}
        <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-center gap-3 flex-shrink-0">
          {isWaitingSemiAutoReview ? (
            /* Semi-Auto Paused State: Review Columns Prompt */
            <div className="w-full sm:w-80 bg-amber-950/70 border-2 border-amber-400/60 backdrop-blur-sm p-3.5 rounded-2xl shadow-xl space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Bước 1 xong: Đã nhận diện {columns.length} cột</span>
              </div>
              <p className="text-[11px] text-indigo-100 leading-tight">
                Vui lòng kiểm tra hoặc chỉnh sửa cột ở <strong>Bước 1</strong> bên dưới, sau đó bấm nút tiếp tục:
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onResumeSemiAuto}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs text-slate-900 bg-gradient-to-r from-emerald-300 via-emerald-200 to-emerald-400 hover:from-emerald-200 hover:to-emerald-300 shadow-md shadow-emerald-500/20 transition-all cursor-pointer animate-pulse"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-900" />
                  <span>Tiếp tục bóc tách (Bước 2➔4)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onCancelSemiAuto}
                  className="p-2.5 rounded-xl text-xs font-semibold text-rose-300 hover:text-white bg-white/10 hover:bg-rose-600/50 border border-white/15 transition-colors cursor-pointer"
                  title="Hủy tự động"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : isFullAutoRunning ? (
            <div className="w-full sm:w-80 bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/15 space-y-2">
              <div className="flex items-start justify-between gap-2 text-xs">
                <span className="font-semibold text-white flex items-start gap-1.5 leading-snug">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300 flex-shrink-0 mt-0.5" />
                  <span className="break-words">{fullAutoStep}</span>
                </span>
                <span className="font-mono text-amber-300 font-bold flex-shrink-0">{fullAutoProgress}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-emerald-400 to-indigo-400 transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${fullAutoProgress}%` }}
                />
              </div>

              {/* Stop Button */}
              <button
                type="button"
                onClick={onStopFullAuto}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-white" />
                <span>Dừng tự động (Stop)</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartFullAuto}
              disabled={pages.length === 0}
              className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm text-slate-900 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 hover:from-amber-200 hover:to-amber-300 shadow-lg shadow-amber-500/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-50 disabled:transform-none"
            >
              <Zap className="w-4 h-4 fill-slate-900 text-slate-900" />
              <span>{isSemiAutoMode ? "Chạy Bán Tự Động" : "Chạy Tự Động Toàn Bộ"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

