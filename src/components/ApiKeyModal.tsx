import React, { useState, useEffect } from "react";
import {
  Key,
  X,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Trash2,
  Sparkles,
  Server,
  Globe,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  getStoredApiKey,
  setStoredApiKey,
  clearStoredApiKey,
  testApiKeyConnection,
  checkBackendServerAvailable,
  isStaticHostingEnvironment,
} from "../services/geminiOcrService";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onKeySaved,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [currentSavedKey, setCurrentSavedKey] = useState<string>("");
  const [isServerOk, setIsServerOk] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    status: "success" | "error" | null;
    message: string;
  }>({ status: null, message: "" });
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);

  const isStaticHost = isStaticHostingEnvironment();

  // Load current configuration whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredApiKey();
      setCurrentSavedKey(stored);
      setApiKeyInput(stored);
      setShowKeyText(false);
      setTestResult({ status: null, message: "" });
      setSaveSuccessNotice(false);

      checkBackendServerAvailable().then((ok) => {
        setIsServerOk(ok);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    const keyToTest = apiKeyInput.trim();
    if (!keyToTest) {
      setTestResult({
        status: "error",
        message: "Vui lòng nhập API Key để kiểm tra kết nối.",
      });
      return;
    }

    setIsTesting(true);
    setTestResult({ status: null, message: "" });

    const res = await testApiKeyConnection(keyToTest);
    setIsTesting(false);
    setTestResult({
      status: res.success ? "success" : "error",
      message: res.message,
    });
  };

  const handleSaveKey = () => {
    const cleanKey = apiKeyInput.trim();
    setStoredApiKey(cleanKey);
    setCurrentSavedKey(cleanKey);
    setSaveSuccessNotice(true);
    setTestResult({ status: null, message: "" });

    if (onKeySaved) {
      onKeySaved();
    }

    setTimeout(() => {
      setSaveSuccessNotice(false);
    }, 4000);
  };

  const handleClearKey = () => {
    clearStoredApiKey();
    setCurrentSavedKey("");
    setApiKeyInput("");
    setTestResult({
      status: "success",
      message: "Đã xóa API Key cá nhân. Ứng dụng đã chuyển về chế độ máy chủ AI Studio mặc định.",
    });

    if (onKeySaved) {
      onKeySaved();
    }
  };

  return (
    <div
      id="api-key-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="api-key-modal-container"
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col p-6 space-y-5 animate-in zoom-in-95 duration-200 text-slate-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex-shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Cài đặt Google Gemini API Key
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Quản lý khóa kết nối cho ứng dụng Web &amp; GitHub Pages
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Environment Status Banner */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Trạng thái môi trường hiện tại:
          </span>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {currentSavedKey ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="font-semibold text-indigo-900">
                    Đang dùng API Key riêng trong trình duyệt
                  </span>
                </>
              ) : isServerOk ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-semibold text-emerald-900">
                    Máy chủ AI Studio (Tự động - Không cần nhập key)
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="font-semibold text-amber-900">
                    Môi trường tĩnh ({isStaticHost ? "GitHub Pages" : "Chưa kết nối máy chủ"}) - Cần nhập API Key
                  </span>
                </>
              )}
            </div>

            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-white border border-slate-200 text-slate-600">
              {isStaticHost ? "GitHub Pages" : isServerOk ? "AI Studio / Dev Server" : "Static Web"}
            </span>
          </div>
        </div>

        {/* API Key Input Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">
              Google Gemini API Key:
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
            >
              <span>Lấy API Key miễn phí tại Google AI Studio</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="relative">
            <input
              type={showKeyText ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKeyText(!showKeyText)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title={showKeyText ? "Ẩn khóa" : "Hiện khóa"}
            >
              {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {currentSavedKey && (
            <p className="text-[11px] text-slate-500 font-mono">
              Khóa đã lưu: {currentSavedKey.slice(0, 8)}...{currentSavedKey.slice(-4)}
            </p>
          )}
        </div>

        {/* Test Result Message Banner */}
        {testResult.status && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in duration-150 ${
              testResult.status === "success"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-red-50 text-red-900 border border-red-200"
            }`}
          >
            {testResult.status === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed">{testResult.message}</span>
          </div>
        )}

        {saveSuccessNotice && (
          <div className="p-3 rounded-xl text-xs bg-emerald-50 text-emerald-900 border border-emerald-200 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Đã lưu API Key thành công vào trình duyệt của bạn!</span>
          </div>
        )}

        {/* Security & Privacy Guarantee */}
        <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-950">
          <ShieldCheck className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-[11px] leading-relaxed">
            <p className="font-bold">Bảo mật &amp; Quyền riêng tư 100%:</p>
            <p className="text-indigo-900/80">
              Khóa API được lưu an toàn cục bộ trong bộ nhớ trình duyệt của bạn (<strong>localStorage</strong>) và chỉ gửi trực tiếp đến máy chủ Google Gemini API khi thực hiện nhận diện. Không có dữ liệu nào được lưu lại trên máy chủ trung gian.
            </p>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div>
            {currentSavedKey && (
              <button
                type="button"
                onClick={handleClearKey}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                title="Xóa khóa đã lưu và quay lại dùng máy chủ mặc định"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa khóa</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !apiKeyInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang kiểm tra...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Kiểm tra kết nối</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleSaveKey}
              disabled={!apiKeyInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Lưu &amp; Áp dụng</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
