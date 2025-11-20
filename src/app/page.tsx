"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import BPChart from "@/components/BPChart";
import { UploadCloud, Save, Loader2, RefreshCw, AlertCircle, LogOut, User, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { signout } from "./login/actions";
import { createClient } from "@/utils/supabase/client";

interface Record {
  id: number;
  systolic: number;
  diastolic: number;
  pulse: number;
  recorded_at: string;
}

export default function Home() {
  const [records, setRecords] = useState<Record[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedData, setAnalyzedData] = useState<{
    systolic: number;
    diastolic: number;
    pulse: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPhone, setUserPhone] = useState<string | null>(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/records");
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (e) {
      console.error("Failed to fetch records", e);
    }
  }, []);

  useEffect(() => {
    fetchRecords();

    // Fetch current user info
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        // Extract phone from email (remove @suffix)
        const phone = user.email?.split('@')[0];
        setUserPhone(phone || '用户');
      }
    });

    // Click outside listener to close menu
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);

  }, [fetchRecords]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setAnalyzing(true);
    setError(null);
    setAnalyzedData(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setAnalyzedData(data);
      }
    } catch (e) {
      setError("识别失败，请重试");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    maxFiles: 1,
  });

  const handleSave = async () => {
    if (!analyzedData) return;

    try {
      const res = await fetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...analyzedData,
          recorded_at: new Date().toISOString()
        }),
      });

      if (res.ok) {
        setAnalyzedData(null);
        fetchRecords();
      } else {
        const data = await res.json();
        alert("保存失败: " + (data.error || 'Unknown error'));
      }
    } catch (e) {
      alert("保存出错");
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between pb-6 border-b relative">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800">血压每日记录</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRecords}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors rounded-full hover:bg-gray-100"
              title="刷新数据"
            >
              <RefreshCw size={20} />
            </button>

            {userPhone && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 bg-white px-3 py-2 rounded-full border hover:bg-gray-50 transition-colors"
                >
                  <User size={16} className="text-gray-500" />
                  <span className="max-w-[100px] truncate">{userPhone}</span>
                  <ChevronDown size={14} className={clsx("text-gray-400 transition-transform", isUserMenuOpen && "rotate-180")} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-gray-50 text-xs text-gray-400">
                      账号设置
                    </div>
                    <button
                      onClick={() => signout()}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                    >
                      <LogOut size={16} />
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Upload Section */}
        <div
          {...getRootProps()}
          className={clsx(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer bg-white shadow-sm",
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400",
            analyzing && "opacity-50 pointer-events-none"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center gap-4">
            {analyzing ? (
              <>
                <Loader2 className="animate-spin text-blue-600" size={48} />
                <p className="text-lg font-medium text-gray-600">AI 正在识别血压读数...</p>
              </>
            ) : (
              <>
                <UploadCloud className="text-blue-500" size={48} />
                <div>
                  <p className="text-lg font-medium text-gray-700">
                    {isDragActive ? "释放文件以上传" : "点击或拖拽血压计照片到这里"}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">支持 JPG, PNG 格式</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Form */}
        {analyzedData && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="w-2 h-6 bg-green-500 rounded-full"></span>
              确认数据
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">收缩压 (高压)</label>
                <input
                  type="number"
                  value={analyzedData.systolic}
                  onChange={(e) => setAnalyzedData({ ...analyzedData, systolic: Number(e.target.value) })}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">舒张压 (低压)</label>
                <input
                  type="number"
                  value={analyzedData.diastolic}
                  onChange={(e) => setAnalyzedData({ ...analyzedData, diastolic: Number(e.target.value) })}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">脉搏</label>
                <input
                  type="number"
                  value={analyzedData.pulse}
                  onChange={(e) => setAnalyzedData({ ...analyzedData, pulse: Number(e.target.value) })}
                  className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-gray-800"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setAnalyzedData(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium transition-all"
              >
                <Save size={18} />
                确认并保存
              </button>
            </div>
          </div>
        )}

        {/* Charts & Stats */}
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            {records.length > 0 ? (
              <BPChart records={records} />
            ) : (
              <div className="text-center py-12 text-gray-400">暂无记录，请上传第一张照片</div>
            )}
          </div>

          {/* Recent List */}
          {records.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold mb-4">最近记录</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-gray-500 border-b">
                    <tr>
                      <th className="pb-3 font-medium">时间</th>
                      <th className="pb-3 font-medium">收缩压</th>
                      <th className="pb-3 font-medium">舒张压</th>
                      <th className="pb-3 font-medium">脉搏</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {records.slice(0, 5).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-3">{new Date(r.recorded_at).toLocaleString()}</td>
                        <td className="py-3 font-medium">{r.systolic}</td>
                        <td className="py-3 font-medium">{r.diastolic}</td>
                        <td className="py-3">{r.pulse}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
