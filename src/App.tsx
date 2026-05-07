/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  History, 
  PlusCircle, 
  ArrowLeftRight, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  User,
  Info,
  ChevronRight,
  LogOut,
  Settings,
  LayoutDashboard,
  Search,
  Camera,
  RotateCcw,
  CameraOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Item, LoanRecord, ItemCondition, LoanStatus } from './types';

// --- CONFIGURATION ---
// Paste your Google Apps Script Web App URL here after deployment
const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbyNw5cx_uEO0XpxwT24JWkA7FACxs2wDGynDchmYXnFQUYRrgqW886c_O4K2FcV0Tn2/exec"; 

export default function App() {
  const [activeTab, setActiveTab] = useState<'input' | 'history' | 'setup'>('input');
  const [items, setItems] = useState<Item[]>([]);
  
  const [records, setRecords] = useState<LoanRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState<LoanRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Semua' | 'Dipinjam' | 'Kembali'>('Semua');

  // Fetch records from Google Sheets on mount
  useEffect(() => {
    const fetchRecords = async () => {
      if (!APPS_SCRIPT_URL) return;
      setIsLoading(true);
      try {
        const response = await fetch(APPS_SCRIPT_URL);
        const data = await response.json();
        if (Array.isArray(data)) {
          // Reverse to show newest first
          setRecords(data.reverse());
        }
      } catch (err) {
        console.error("Gagal mengambil data dari Google Sheets:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecords();
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Perbaikan: Gunakan useEffect untuk menempelkan stream ke video saat elemen sudah muncul
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function enableStream() {
      if (showCamera) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera access denied:", err);
          alert("Gagal mengakses kamera. Silakan periksa izin kamera di browser Anda.");
          setShowCamera(false);
        }
      }
    }

    enableStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [showCamera, facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

  const startCamera = () => {
    setShowCamera(true);
  };

  const stopCamera = () => {
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        setPhoto(canvas.toDataURL('image/jpeg', 0.5)); // Low quality to save space
        stopCamera();
      }
    }
  };

  const handleLoanSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    
    const newRecord: LoanRecord = {
      id: `L${Date.now()}`,
      itemId: `M-${Date.now()}`,
      itemName: formData.get('itemName') as string,
      borrower: formData.get('borrower') as string,
      borrowDate: formData.get('borrowDate') as string,
      expectedReturnDate: formData.get('expectedReturnDate') as string,
      borrowCondition: formData.get('condition') as ItemCondition,
      quantity: Number(formData.get('quantity')),
      notes: (formData.get('notes') as string) || (formData.get('spec') as string),
      status: 'Dipinjam',
      borrowerPhoto: photo || undefined
    };

    // Update Local State
    setRecords([newRecord, ...records]);
    
    // Optional: Add to items catalog if you want to keep track of unique items seen
    const itemExists = items.find(i => i.name === newRecord.itemName);
    if (!itemExists) {
      setItems([...items, { 
        id: newRecord.itemId, 
        name: newRecord.itemName, 
        spec: formData.get('spec') as string,
        totalQuantity: newRecord.quantity,
        availableQuantity: 0
      }]);
    }

    // Async call to Google Sheets
    await syncToGoogleSheets('ADD_RECORD', newRecord);

    setIsSubmitting(false);
    setActiveTab('history'); // Switch to history after success
    setPhoto(null);
    (e.target as HTMLFormElement).reset();
  };

  const handleReturnSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (!showReturnModal) return;

    const returnDate = formData.get('returnDate') as string || new Date().toISOString().split('T')[0];
    const returnCondition = formData.get('condition') as ItemCondition;

    // Update Record
    setRecords(records.map(rec => 
      rec.id === showReturnModal.id 
        ? { ...rec, status: 'Kembali', returnDate, returnCondition, returnPhoto: photo || undefined } 
        : rec
    ));

    // Update Item Quantity
    setItems(items.map(item => 
      item.id === showReturnModal.itemId 
        ? { ...item, availableQuantity: item.availableQuantity + showReturnModal.quantity } 
        : item
    ));

    // Sync
    syncToGoogleSheets('RETURN_ITEM', { 
      id: showReturnModal.id, 
      returnDate, 
      returnCondition,
      returnPhoto: photo || undefined
    });

    setShowReturnModal(null);
    setPhoto(null);
  };

  const syncToGoogleSheets = async (action: string, data: any) => {
    if (!APPS_SCRIPT_URL) return;
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data })
      });
    } catch (err) {
      console.error("Sheets Sync Failed:", err);
    }
  };

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      record.borrower.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'Semua' || record.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 pb-16 md:pb-0">
      {/* Sidebar - Desktop Only */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 text-blue-600 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-blue-600/20">I</div>
            <span className="text-slate-800">InventarisPro</span>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('input')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab === 'input' ? 'bg-slate-100 text-blue-600 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
          >
            <PlusCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Pencatatan Baru</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab === 'history' ? 'bg-slate-100 text-blue-600 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
          >
            <History className="w-4 h-4" />
            <span className="text-sm font-medium">Riwayat Pinjam</span>
          </button>
          <button 
            onClick={() => setActiveTab('setup')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${activeTab === 'setup' ? 'bg-slate-100 text-blue-600 shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">Integrasi G-Sheets</span>
          </button>
        </nav>

        <div className="mt-auto p-6 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">Admin Gudang</p>
              <p className="text-[10px] text-slate-500">Sync Active (G-Sheets)</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shrink-0 z-10">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Cari data..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 transition-all outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <div className="hidden sm:flex px-3 py-1 bg-green-100 text-green-700 text-[9px] font-bold uppercase tracking-wider rounded-full items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
              Live Sync
            </div>
            <div className="px-3 py-1 bg-blue-100 text-blue-700 text-[9px] font-bold uppercase tracking-wider rounded-full">
              ADMIN
            </div>
          </div>
        </header>

        {/* Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
          <header className="mb-6">
            <h2 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              {activeTab === 'input' ? 'Pencatatan Baru' : activeTab === 'history' ? 'Riwayat Pinjam' : 'Pengaturan'}
            </h2>
          </header>

          <AnimatePresence mode="wait">
            {activeTab === 'input' && (
              <motion.div 
                key="input-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                {/* Main Form */}
                <form onSubmit={handleLoanSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Package className="w-3 h-3" /> Nama Barang
                      </label>
                      <input name="itemName" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="Contoh: Laptop MacBook Pro" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Info className="w-3 h-3" /> Spesifikasi / Merk
                      </label>
                      <input name="spec" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="M2 Pro, 16GB RAM, 512GB" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <PlusCircle className="w-3 h-3" /> Jumlah
                      </label>
                      <input name="quantity" type="number" min="1" defaultValue="1" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Tgl Pinjam
                      </label>
                      <input name="borrowDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" />
                    </div>
                    <div className="col-span-2 md:col-span-1 space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <User className="w-3 h-3" /> Peminjam
                      </label>
                      <input name="borrower" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" placeholder="Nama Lengkap" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kondisi Saat Pinjam</label>
                      <select name="condition" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all">
                        <option value="Baik">🟢 Baik</option>
                        <option value="Rusak Ringan">🟡 Rusak Ringan</option>
                        <option value="Rusak Berat">🔴 Rusak Berat</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Tgl Kembali</label>
                      <input name="expectedReturnDate" type="date" required className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Keterangan Tambahan</label>
                    <textarea name="notes" rows={3} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/10 focus:border-blue-600 outline-none resize-none transition-all" placeholder="Tujuan peminjaman atau catatan khusus..." />
                  </div>

                  {/* Photo Capture Section */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Foto Peminjam</label>
                    <div className="flex items-center gap-4">
                      {photo ? (
                        <div className="relative group w-32 h-32 rounded-xl overflow-hidden border-2 border-blue-500">
                          <img src={photo} alt="Borrower" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => setPhoto(null)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <RotateCcw className="w-6 h-6" />
                          </button>
                        </div>
                      ) : showCamera ? (
                        <div className="relative w-full max-w-sm rounded-xl overflow-hidden bg-slate-900 border-2 border-blue-500 shadow-2xl">
                          <video ref={videoRef} autoPlay playsInline className={`w-full h-auto ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
                          <div className="absolute top-4 right-4">
                            <button 
                              type="button"
                              onClick={toggleCamera}
                              className="bg-white/20 backdrop-blur-md text-white p-2 rounded-full border border-white/20 hover:bg-white/30 transition-all active:scale-90"
                              title="Tukar Kamera"
                            >
                              <ArrowLeftRight className="w-5 h-5" />
                            </button>
                          </div>
                          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-6">
                            <button 
                              type="button" 
                              onClick={capturePhoto}
                              className="bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all outline-none ring-4 ring-blue-600/20"
                            >
                              <Camera className="w-7 h-7" />
                            </button>
                            <button 
                              type="button" 
                              onClick={stopCamera}
                              className="bg-red-600 text-white p-4 rounded-full shadow-lg hover:bg-red-700 active:scale-95 transition-all outline-none ring-4 ring-red-600/20"
                            >
                              <CameraOff className="w-7 h-7" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={startCamera}
                          className="w-32 h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/50 transition-all group"
                        >
                          <Camera className="w-8 h-8 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Ambil Foto</span>
                        </button>
                      )}
                      
                      {!showCamera && !photo && (
                        <div className="flex-1 text-[10px] text-slate-400 leading-relaxed italic">
                          Ambil foto wajah peminjam untuk bukti verifikasi fisik yang akan tersimpan otomatis di Google Sheets.
                        </div>
                      )}
                    </div>
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 group active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Menyimpan...
                      </span>
                    ) : (
                      <>
                        Simpan & Sinkronkan Data
                        <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>

                {/* Info Column */}
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <History className="w-4 h-4 text-orange-500" />
                      Status Pinjaman Aktif
                    </h3>
                    <div className="space-y-3">
                      {records.filter(r => r.status === 'Dipinjam').slice(0, 3).map(rec => (
                        <div key={rec.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-xs font-bold text-slate-700 truncate">{rec.itemName}</p>
                          <p className="text-[10px] text-slate-500 font-medium">{rec.borrower}</p>
                        </div>
                      ))}
                      {records.filter(r => r.status === 'Dipinjam').length === 0 && (
                        <p className="text-xs text-slate-400 italic text-center py-4">Semua barang telah kembali</p>
                      )}
                    </div>
                  </div>

                  <div className="bg-blue-600 rounded-2xl p-6 text-white shadow-xl shadow-blue-600/20 relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold mb-1">Total Hari Ini</p>
                      <p className="text-4xl font-bold mb-4">{records.filter(r => r.borrowDate === new Date().toISOString().split('T')[0]).length}</p>
                      <div className="flex justify-between text-[10px] border-t border-white/20 pt-4 font-bold tracking-wider">
                        <span className="uppercase">{records.filter(r => r.status === 'Kembali').length} Kembali</span>
                        <span className="uppercase">{records.filter(r => r.status === 'Dipinjam').length} Aktif</span>
                      </div>
                    </div>
                    <Package className="absolute -right-8 -bottom-8 w-32 h-32 text-white/10" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                <div className="p-4 border-b border-slate-100 bg-slate-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1 shrink-0">Filter:</span>
                    {(['Semua', 'Dipinjam', 'Kembali'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() => setStatusFilter(status)}
                        className={`px-3 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all shrink-0 ${
                          statusFilter === status 
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                            : 'bg-white text-slate-500 border border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between sm:justify-end gap-2">
                    <span>{filteredRecords.length} Data ditemukan</span>
                  </div>
                </div>
                
                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-slate-100">
                  {isLoading ? (
                    <div className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sync Data...</p>
                      </div>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="px-6 py-12 text-center text-slate-400 text-sm">Data tidak ditemukan</div>
                  ) : (
                    filteredRecords.map(record => (
                      <div key={record.id} className="p-4 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                      {record.borrowerPhoto && record.borrowerPhoto.startsWith('data:image') ? (
                                 <img 
                                   src={record.borrowerPhoto} 
                                   className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" 
                                   alt={record.borrower} 
                                   onClick={() => setPreviewPhoto(record.borrowerPhoto || null)}
                                 />
                               ) : (
                                 <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-white shadow-sm">
                                   <User className="w-5 h-5" />
                                 </div>
                               )}
                               <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${record.status === 'Dipinjam' ? 'bg-orange-500' : 'bg-green-500'}`}>
                                 {record.status === 'Dipinjam' ? <AlertCircle className="w-2 h-2 text-white" /> : <CheckCircle2 className="w-2 h-2 text-white" />}
                               </div>
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 text-sm">{record.itemName}</div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                                <span className="font-semibold">{record.borrower}</span> • <span className="font-mono text-[9px]">{record.id}</span>
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest border ${record.status === 'Dipinjam' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                            {record.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Pinjam</p>
                            <p className="text-[11px] font-bold text-slate-700 tracking-tight">{record.borrowDate}</p>
                            <p className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">{record.borrowCondition}</p>
                          </div>
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 leading-none">Estimasi</p>
                            <p className="text-[11px] font-bold text-slate-700 tracking-tight">{record.expectedReturnDate}</p>
                            {record.returnDate && (
                              <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">{record.returnDate}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2">
                             {record.returnPhoto && record.returnPhoto.startsWith('data:image') ? (
                               <button 
                                 onClick={() => setPreviewPhoto(record.returnPhoto || null)}
                                 className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg shadow-sm"
                               >
                                 <Camera className="w-3 h-3 text-slate-400" />
                                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Foto Bukti</span>
                               </button>
                             ) : record.status === 'Kembali' && (
                               <span className="text-[9px] text-slate-400 italic">Tanpa foto bukti</span>
                             )}
                          </div>
                          
                          {record.status === 'Dipinjam' ? (
                            <button 
                              onClick={() => setShowReturnModal(record)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-blue-600/20 active:scale-95 transition-all"
                            >
                              Konfirmasi Kembali
                            </button>
                          ) : (
                             <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                               <CheckCircle2 className="w-3 h-3" />
                               <span className="text-[10px] font-bold uppercase tracking-widest">Selesai</span>
                             </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-widest border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4">Barang</th>
                        <th className="px-6 py-4">Peminjam</th>
                        <th className="px-6 py-4">Waktu Pinjam</th>
                        <th className="px-6 py-4">Estimasi Kembali</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Foto Kembali</th>
                        <th className="px-6 py-4">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isLoading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sinkronisasi Data...</p>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm">Data tidak ditemukan</td>
                        </tr>
                      ) : (
                        filteredRecords.map(record => (
                          <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-800 text-sm">{record.itemName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{record.id}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {record.borrowerPhoto && record.borrowerPhoto.startsWith('data:image') ? (
                                  <img 
                                    src={record.borrowerPhoto} 
                                    className="w-8 h-8 rounded-full object-cover border border-slate-200 cursor-zoom-in hover:scale-110 transition-transform" 
                                    alt={record.borrower} 
                                    onClick={() => setPreviewPhoto(record.borrowerPhoto || null)}
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                    <User className="w-4 h-4" />
                                  </div>
                                )}
                                <div className="text-slate-600 font-medium text-sm">{record.borrower}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-slate-700">{record.borrowDate}</div>
                              <div className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">{record.borrowCondition}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-slate-700">{record.expectedReturnDate}</div>
                              {record.returnDate && (
                                <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Done: {record.returnDate}</div>
                              )}
                            </td>
                            <td className="px-6 py-4">
                               <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${record.status === 'Dipinjam' ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                 {record.status}
                               </span>
                            </td>
                            <td className="px-6 py-4">
                               {record.returnPhoto && record.returnPhoto.startsWith('data:image') ? (
                                 <img 
                                   src={record.returnPhoto} 
                                   className="w-8 h-8 rounded-full object-cover border border-slate-200 cursor-zoom-in hover:scale-110 transition-transform" 
                                   alt="Return Evidence" 
                                   onClick={() => setPreviewPhoto(record.returnPhoto || null)}
                                 />
                               ) : record.status === 'Kembali' ? (
                                 <span className="text-[10px] text-slate-400 italic">Tanpa Foto</span>
                               ) : (
                                 <span className="text-[10px] text-slate-300">-</span>
                               )}
                            </td>
                            <td className="px-6 py-4">
                              {record.status === 'Dipinjam' ? (
                                <button 
                                  onClick={() => setShowReturnModal(record)}
                                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 group"
                                >
                                  Kembalikan 
                                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selesai</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeTab === 'setup' && (
              <motion.div 
                key="setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-3xl mx-auto space-y-8"
              >
                <div className="bg-blue-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-blue-600/20">
                  <div className="relative z-10">
                    <h2 className="text-2xl font-bold mb-4 tracking-tight">Integrasi Google Sheets</h2>
                    <p className="text-blue-100 text-sm leading-relaxed mb-6 opacity-90">
                      Anda dapat menghubungkan aplikasi ini ke Google Sheets untuk mencatat riwayat peminjaman secara otomatis secara online.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      <a href="https://docs.google.com/spreadsheets/u/0/create" target="_blank" className="bg-white text-blue-600 px-6 py-2.5 rounded-full text-sm font-bold hover:bg-blue-50 transition-colors shadow-lg shadow-black/5">
                        Buka Google Sheets
                      </a>
                    </div>
                  </div>
                  <Package className="absolute -right-12 -bottom-12 w-64 h-64 text-blue-500/20" />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="font-bold text-slate-800 text-md mb-6 flex items-center gap-3">
                    <Info className="w-5 h-5 text-blue-500" />
                    Instruksi Setup Apps Script
                  </h3>
                  
                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0 border border-slate-200">1</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Buka Apps Script</h4>
                        <p className="text-xs text-slate-500">Di Google Sheets, klik menu <span className="font-semibold text-slate-700">Extensions</span> &gt; <span className="font-semibold text-slate-700">Apps Script</span>.</p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0 border border-slate-200">2</div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Salin Kode Backend</h4>
                        <div className="relative group">
                          <pre className="bg-slate-900 text-slate-400 p-4 rounded-xl text-[10px] overflow-x-auto max-h-64 border border-white/10 font-mono">
{`function doGet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Riwayat");
  if (!sheet) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    result.push({
      id: row[0], itemName: row[1], borrower: row[2], borrowDate: row[3],
      expectedReturnDate: row[4], borrowCondition: row[5], quantity: row[6],
      notes: row[7], status: row[8], returnDate: row[9], returnCondition: row[10],
      borrowerPhoto: row[11], returnPhoto: row[12]
    });
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Riwayat") || ss.insertSheet("Riwayat");
  if (sheet.getLastRow() == 0) {
    sheet.appendRow(["ID", "Barang", "Peminjam", "Tgl Pinjam", "Estimasi Kembali", "Kondisi Pinjam", "Jumlah", "Keterangan", "Status", "Tgl Kembali", "Kondisi Kembali", "Foto Peminjam", "Foto Kembali"]);
  }
  var payload = JSON.parse(e.postData.contents);
  var action = payload.action;
  var data = payload.data;
  if (action === "ADD_RECORD") {
    sheet.appendRow([data.id, data.itemName, data.borrower, data.borrowDate, data.expectedReturnDate, data.borrowCondition, data.quantity, data.notes, data.status, "-", "-", data.borrowerPhoto || "-", "-"]);
  } else if (action === "RETURN_ITEM") {
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] == data.id) {
        sheet.getRange(i + 1, 9).setValue("Kembali");
        sheet.getRange(i + 1, 10).setValue(data.returnDate);
        sheet.getRange(i + 1, 11).setValue(data.returnCondition);
        sheet.getRange(i + 1, 13).setValue(data.returnPhoto || "-");
        break;
      }
    }
  }
  return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
}`}
                          </pre>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0 border border-slate-200">3</div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm mb-1 uppercase tracking-wider">Publish Web App</h4>
                        <p className="text-xs text-slate-500">Klik <span className="font-semibold text-slate-700">Deploy</span> &gt; <span className="font-semibold text-slate-700">New Deployment</span> &gt; <span className="font-semibold text-slate-700">Web App</span>. Akses: <span className="font-semibold text-slate-700">Anyone</span>.</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-4 text-blue-800">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p className="text-[10px] leading-relaxed font-medium">
                        <strong>PENTING:</strong> Setelah Deploy, masukkan URL yang didapat ke variabel <code className="bg-white/60 px-1 rounded font-mono">APPS_SCRIPT_URL</code> di source code aplikasi ini untuk mengaktifkan sinkronisasi.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Bottom Navigation - Mobile Only */}
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex md:hidden items-center justify-around px-2 z-40 bg-white/80 backdrop-blur-lg">
        <button 
          onClick={() => setActiveTab('input')}
          className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all ${activeTab === 'input' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'input' ? 'bg-blue-50' : 'text-slate-400'}`}>
            <PlusCircle className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider">Input</span>
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all ${activeTab === 'history' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'history' ? 'bg-blue-50' : 'text-slate-400'}`}>
            <History className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider">Riwayat</span>
        </button>
        <button 
          onClick={() => setActiveTab('setup')}
          className={`flex flex-col items-center justify-center gap-1 w-full h-full transition-all ${activeTab === 'setup' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'setup' ? 'bg-blue-50' : 'text-slate-400'}`}>
            <Settings className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider">Config</span>
        </button>
      </nav>

      {/* Return Modal */}
      <AnimatePresence>
        {showReturnModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReturnModal(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-slate-200"
            >
              <div className="p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight leading-tight">Pengembalian Barang</h2>
                    <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">{showReturnModal.itemName}</p>
                  </div>
                </div>
                
                <form onSubmit={handleReturnSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Tgl Kembali
                      </label>
                      <input name="returnDate" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kondisi Barang</label>
                      <select name="condition" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all">
                        <option value="Baik">🟢 Baik</option>
                        <option value="Rusak Ringan">🟡 Rusak Ringan</option>
                        <option value="Rusak Berat">🔴 Rusak Berat</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Camera className="w-3 h-3" /> Foto Bukti Kembali
                    </label>
                    <div className="flex items-center gap-4">
                      {photo ? (
                        <div className="relative group w-24 h-24 rounded-xl overflow-hidden border-2 border-emerald-500">
                          <img src={photo} alt="Return" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={() => setPhoto(null)}
                            className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <RotateCcw className="w-5 h-5" />
                          </button>
                        </div>
                      ) : showCamera ? (
                        <div className="relative w-full rounded-xl overflow-hidden bg-slate-900 border-2 border-emerald-500 aspect-video">
                          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-3">
                            <button type="button" onClick={capturePhoto} className="bg-emerald-600 text-white p-2 rounded-full shadow-lg hover:bg-emerald-700 active:scale-95 transition-all outline-none">
                              <Camera className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={stopCamera} className="bg-red-600 text-white p-2 rounded-full shadow-lg hover:bg-red-700 active:scale-95 transition-all outline-none">
                              <CameraOff className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => setShowCamera(true)}
                          className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-emerald-300 hover:text-emerald-500 hover:bg-emerald-50/50 transition-all group"
                        >
                          <Camera className="w-6 h-6 group-hover:scale-110 transition-transform" />
                          <span className="text-[8px] font-bold uppercase tracking-wider">Ambil Foto</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => { setShowReturnModal(null); setPhoto(null); stopCamera(); }} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all">Batal</button>
                    <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-600/20 active:scale-95 transition-all">Konfirmasi Kembali</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Photo Preview Modal */}
      <AnimatePresence>
        {previewPhoto && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewPhoto(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-2xl w-full aspect-square md:aspect-auto bg-white rounded-3xl overflow-hidden shadow-2xl"
            >
              <img src={previewPhoto} alt="Full Preview" className="w-full h-full object-contain bg-slate-100" />
              <button 
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-all font-bold"
              >
                ✕
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
