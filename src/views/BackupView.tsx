import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  FileCheck,
  ShieldCheck,
  Calendar,
  Layers,
  Truck,
  FileSpreadsheet,
  Users,
  Building2,
  AlertCircle,
  ArrowRight,
  FileJson
} from 'lucide-react';

interface BackupViewProps {
  onNavigateToConciliation?: () => void;
}

export const BackupView: React.FC<BackupViewProps> = ({ onNavigateToConciliation }) => {
  const { currentUser } = useAuth();
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [backupStats, setBackupStats] = useState<any>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // Restore state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<any>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<{
    type: 'success' | 'error';
    message: string;
    stats?: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDatabaseInfo = async () => {
    try {
      setLoadingStatus(true);
      const [statusRes, backupRes] = await Promise.all([
        fetch('/api/database/status'),
        fetch('/api/database/backup')
      ]);

      if (statusRes.ok) {
        const s = await statusRes.json();
        setDbStatus(s);
      }

      if (backupRes.ok) {
        const b = await backupRes.json();
        setBackupStats(b.stats);
      }
    } catch (err) {
      console.error('Error fetching backup info:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchDatabaseInfo();
  }, []);

  // 1. REALIZAR BACKUP ACTION
  const handleRealizarBackup = async () => {
    try {
      setDownloading(true);
      setDownloadSuccess(false);

      const res = await fetch('/api/database/backup');
      if (!res.ok) {
        throw new Error('Falha ao gerar o arquivo de backup.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `backup-conciliapix-${dateStr}-${timeStr}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
      fetchDatabaseInfo();
    } catch (err: any) {
      alert(err.message || 'Erro ao realizar backup');
    } finally {
      setDownloading(false);
    }
  };

  // 2. PARSE FILE IMMEDIATELY ON SELECTION
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setRestoreResult(null);
    setFileError(null);
    setParsedBackupData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('O arquivo selecionado está vazio ou não é um objeto JSON.');
        }

        const dataObj = parsed.data || parsed;
        const txCount = Array.isArray(dataObj.transactions) ? dataObj.transactions.length : 0;
        const drvCount = Array.isArray(dataObj.drivers) ? dataObj.drivers.length : 0;
        const batchCount = Array.isArray(dataObj.import_batches) ? dataObj.import_batches.length : 0;
        const sessionCount = Array.isArray(dataObj.reconciliation_sessions) ? dataObj.reconciliation_sessions.length : 0;

        setParsedBackupData({
          raw: parsed,
          fileName: file.name,
          fileSizeKb: (file.size / 1024).toFixed(1),
          transactionsCount: txCount,
          driversCount: drvCount,
          batchesCount: batchCount,
          sessionsCount: sessionCount,
          exportedAt: parsed.exportedAt || null
        });
      } catch (err: any) {
        console.error('Error parsing JSON backup file:', err);
        setFileError(err.message || 'Arquivo JSON inválido ou corrompido.');
        setParsedBackupData(null);
      }
    };
    reader.onerror = () => {
      setFileError('Erro ao ler arquivo no navegador.');
    };
    reader.readAsText(file);
  };

  // 3. RESTAURAR BACKUP ACTION (NO window.confirm to avoid iframe blocks)
  const handleRestaurarBackup = async () => {
    if (!parsedBackupData?.raw) {
      setRestoreResult({
        type: 'error',
        message: 'Por favor, selecione primeiro um arquivo de backup válido (.json).'
      });
      return;
    }

    try {
      setRestoring(true);
      setRestoreResult(null);

      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupData: parsedBackupData.raw,
          actorUser: currentUser || { id: 'usr-admin', name: 'Administrador', role: 'ADMIN' }
        })
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Falha ao restaurar dados no servidor.');
      }

      setRestoreResult({
        type: 'success',
        message: json.message || 'Backup restaurado com sucesso!',
        stats: json.stats
      });

      // Clear input selection
      setSelectedFile(null);
      setParsedBackupData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Immediately refresh stats in UI
      await fetchDatabaseInfo();
    } catch (err: any) {
      console.error('Restore error:', err);
      setRestoreResult({
        type: 'error',
        message: err.message || 'Erro inesperado ao restaurar dados.'
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Cloud Persistence Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900">Backup & Restauração de Dados</h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Google Cloud SQL Ativo
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Realize o backup ao final de cada dia ou após conciliar seus lançamentos para salvar uma cópia física segura no seu dispositivo. Caso precise reiniciar ou transferir dados, utilize o campo de restauração.
            </p>
          </div>
        </div>

        <button
          onClick={fetchDatabaseInfo}
          disabled={loadingStatus}
          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shrink-0 self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin text-blue-600' : ''}`} />
          <span>Atualizar Status</span>
        </button>
      </div>

      {/* Main Two Requested Fields: Realizar Backup & Restaurar Backup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ========================================================================= */}
        {/* CAMPO 1: REALIZAR BACKUP */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-blue-200 p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/60 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />

          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs shadow-blue-500/20">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Campo: Realizar Backup</h3>
                <p className="text-xs text-slate-500">Exportação completa de todos os dados do sistema</p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                O que este backup inclui:
              </p>
              <ul className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-1">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Todos os lançamentos Pix</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Cadastro de motoristas</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Acertos finalizados e recibos</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Extratos bancários (OFX/CSV)</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Matriz e Filial</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>Histórico de auditoria</span>
                </li>
              </ul>
            </div>

            {downloadSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center space-x-2 text-xs text-emerald-900 font-medium animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Arquivo de backup baixado com sucesso para a pasta de downloads!</span>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 mt-6">
            <button
              onClick={handleRealizarBackup}
              disabled={downloading}
              className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
              <span>{downloading ? 'Gerando arquivo de backup...' : 'Realizar Backup'}</span>
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              Clique ao final do dia para salvar seu arquivo de segurança (.json).
            </p>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CAMPO 2: RESTAURAR BACKUP */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-xs">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Campo: Restaurar Backup</h3>
                <p className="text-xs text-slate-500">Recupere todos os dados a partir de um arquivo baixado</p>
              </div>
            </div>

            {/* File Selection Box with Drag-and-Drop / Click */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Selecione ou arraste o arquivo de backup (.json):
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  parsedBackupData
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-xs'
                    : fileError
                    ? 'border-red-400 bg-red-50/40'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/30'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onClick={(e) => {
                    // Reset input so selecting the exact same file fires onChange reliably
                    (e.target as HTMLInputElement).value = '';
                  }}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {parsedBackupData ? (
                  <div className="space-y-2 text-left">
                    <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                      <div className="flex items-center space-x-2 text-emerald-900 font-bold text-xs truncate max-w-[280px]">
                        <FileCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                        <span className="truncate">{parsedBackupData.fileName}</span>
                      </div>
                      <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full shrink-0">
                        {parsedBackupData.fileSizeKb} KB
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-emerald-800 pt-1">
                      <p className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Lançamentos: <strong>{parsedBackupData.transactionsCount}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Motoristas: <strong>{parsedBackupData.driversCount}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Extratos: <strong>{parsedBackupData.batchesCount}</strong></span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>Acertos: <strong>{parsedBackupData.sessionsCount}</strong></span>
                      </p>
                    </div>

                    <p className="text-[10px] text-emerald-700 italic pt-1">
                      Arquivo verificado com sucesso. Clique no botão abaixo para restaurar agora.
                    </p>
                  </div>
                ) : fileError ? (
                  <div className="space-y-1.5 text-red-700 text-xs">
                    <AlertTriangle className="w-6 h-6 mx-auto text-red-600" />
                    <p className="font-bold">Erro ao processar arquivo</p>
                    <p className="text-[11px] text-red-600">{fileError}</p>
                    <p className="text-[10px] text-slate-500 pt-1 underline">Clique para tentar selecionar outro arquivo</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-slate-500 text-xs py-1">
                    <FileJson className="w-7 h-7 mx-auto text-slate-400" />
                    <p className="font-semibold text-slate-700">Clique para selecionar o arquivo de backup</p>
                    <p className="text-[11px] text-slate-400">Arquivos no formato .json exportados pelo sistema</p>
                  </div>
                )}
              </div>
            </div>

            {/* Restore Result Messages */}
            {restoreResult && (
              <div
                className={`p-4 rounded-xl text-xs space-y-2 border animate-fade-in ${
                  restoreResult.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-red-50 text-red-900 border-red-300'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {restoreResult.type === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-bold text-sm">
                      {restoreResult.type === 'success' ? 'Restauração Concluída!' : 'Erro na Restauração'}
                    </p>
                    <p className="text-xs mt-0.5 leading-relaxed">{restoreResult.message}</p>
                  </div>
                </div>

                {restoreResult.type === 'success' && onNavigateToConciliation && (
                  <div className="pt-2 border-t border-emerald-200 flex justify-end">
                    <button
                      onClick={onNavigateToConciliation}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <span>Ver Conciliação dos Lançamentos</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-100 mt-6">
            <button
              onClick={handleRestaurarBackup}
              disabled={restoring || !parsedBackupData}
              className={`w-full py-3.5 px-4 font-bold text-sm rounded-xl shadow-md flex items-center justify-center space-x-2 transition-all cursor-pointer disabled:opacity-50 ${
                parsedBackupData
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              <Upload className={`w-4 h-4 ${restoring ? 'animate-bounce' : ''}`} />
              <span>
                {restoring
                  ? 'Restaurando dados e sincronizando na nuvem...'
                  : parsedBackupData
                  ? `Restaurar Backup (${parsedBackupData.transactionsCount} lançamentos)`
                  : 'Restaurar Backup'}
              </span>
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              Selecione o arquivo de backup acima para habilitar o botão de restauração.
            </p>
          </div>
        </div>
      </div>

      {/* Current System Records Summary */}
      {backupStats && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Contagem Atual de Dados Protegidos no Sistema
            </h3>
            <span className="text-[11px] text-slate-400">
              {dbStatus?.lastSync ? `Última sincronização na nuvem: ${new Date(dbStatus.lastSync).toLocaleString('pt-BR')}` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <p className="text-lg font-extrabold text-blue-600">{backupStats.transactionsCount || 0}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">Lançamentos</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <p className="text-lg font-extrabold text-slate-800">{backupStats.driversCount || 0}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">Motoristas</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <p className="text-lg font-extrabold text-emerald-600">{backupStats.sessionsCount || 0}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">Acertos Concluídos</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <p className="text-lg font-extrabold text-amber-600">{backupStats.usersCount || 0}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">Usuários</p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-center">
              <p className="text-lg font-extrabold text-indigo-600">{backupStats.companiesCount || 0}</p>
              <p className="text-[11px] font-medium text-slate-500 mt-0.5">Unidades (Empresas)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
