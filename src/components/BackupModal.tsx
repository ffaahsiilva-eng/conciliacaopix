import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  HardDrive,
  Cloud,
  FileSpreadsheet,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  Save
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Google Drive & Sheets state
  const [driveStatus, setDriveStatus] = useState<any>(null);
  const [webhookInput, setWebhookInput] = useState('');
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const [resDb, resDrive] = await Promise.all([
        fetch('/api/database/status'),
        fetch('/api/google-drive/status')
      ]);

      if (resDb.ok) {
        const data = await resDb.json();
        setDbStatus(data);
      }

      if (resDrive.ok) {
        const driveData = await resDrive.json();
        setDriveStatus(driveData);
        if (driveData.webhookUrl && !webhookInput) {
          // If already configured, show current
          setWebhookInput('');
        }
      }
    } catch (err) {
      console.error('Error fetching DB status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setRestoreMessage(null);
      setDriveMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    window.location.href = '/api/database/backup';
  };

  const handleSaveWebhook = async () => {
    if (!webhookInput.trim()) return;
    try {
      setSavingWebhook(true);
      setDriveMessage(null);
      const res = await fetch('/api/google-drive/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: webhookInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar URL.');
      setDriveMessage({ type: 'success', text: 'URL do Google Apps Script configurada com sucesso!' });
      setDriveStatus(data.status);
      setWebhookInput('');
    } catch (err: any) {
      setDriveMessage({ type: 'error', text: err.message || 'Falha ao salvar URL.' });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleSyncGoogleDrive = async () => {
    try {
      setSyncingDrive(true);
      setDriveMessage(null);
      const res = await fetch('/api/google-drive/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Erro ao sincronizar com Google Drive.');
      }
      setDriveMessage({
        type: 'success',
        text: data.message || 'Backup salvo no Google Drive e Planilha atualizada com sucesso!'
      });
      fetchStatus();
    } catch (err: any) {
      setDriveMessage({
        type: 'error',
        text: err.message || 'Falha ao sincronizar com Google Drive.'
      });
    } finally {
      setSyncingDrive(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      const res = await fetch('/api/google-drive/script');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 3000);
    } catch (err) {
      console.error('Erro ao copiar script:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Persistência & Backup de Dados</h3>
              <p className="text-[11px] text-slate-400">Armazenamento em Nuvem & Google Drive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Cloud SQL Status Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-600" />
                Banco de Produção (Supabase / Nuvem)
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {dbStatus?.cloudSqlActive ? 'Supabase Conectado' : 'Conectando à Nuvem...'}
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Todos os lançamentos, motoristas, acertos e logs estão gravados de forma permanente no banco de dados na nuvem.
            </p>

            {dbStatus?.lastSync && (
              <p className="text-[11px] text-slate-400">
                Último snapshot na nuvem: {new Date(dbStatus.lastSync).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* GOOGLE DRIVE & GOOGLE SHEETS BOX */}
          <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Cloud className="w-4 h-4 text-emerald-600" />
                Google Drive & Planilha Excel Automática
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  driveStatus?.configured
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border-amber-300'
                }`}
              >
                {driveStatus?.configured ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Vinculado ao Drive
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Não Configurado
                  </>
                )}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Salva um arquivo de backup <strong>.json</strong> na pasta <code>ConciliaPix_Backups</code> do seu Google Drive e preenche automaticamente uma Planilha Google com 3 abas organizadas: <strong>Lançamentos</strong>, <strong>Acertos</strong> e <strong>Resumo por Motorista</strong>.
            </p>

            {/* Status of last drive sync */}
            {driveStatus?.lastSync && (
              <div className="flex items-center justify-between text-[11px] bg-white/80 px-3 py-1.5 rounded-lg border border-emerald-100 text-slate-600">
                <span>Último envio ao Google Drive:</span>
                <span className="font-semibold text-emerald-800">
                  {new Date(driveStatus.lastSync).toLocaleString('pt-BR')}
                </span>
              </div>
            )}

            {/* Drive message alert */}
            {driveMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${
                  driveMessage.type === 'success'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-red-50 text-red-900 border-red-300'
                }`}
              >
                {driveMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{driveMessage.text}</span>
              </div>
            )}

            {/* Webhook URL Input */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-700 block">
                URL do Webhook do Google Apps Script:
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder={
                    driveStatus?.configured
                      ? 'Webhook configurado. Cole nova URL para atualizar...'
                      : 'https://script.google.com/macros/s/.../exec'
                  }
                  value={webhookInput}
                  onChange={(e) => setWebhookInput(e.target.value)}
                  className="flex-1 text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                />
                <button
                  type="button"
                  onClick={handleSaveWebhook}
                  disabled={savingWebhook || !webhookInput.trim()}
                  className="inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-2 rounded-lg text-xs transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingWebhook ? 'Salvando...' : 'Salvar URL'}</span>
                </button>
              </div>
            </div>

            {/* Actions for Google Drive */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSyncGoogleDrive}
                disabled={syncingDrive || !driveStatus?.configured}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingDrive ? 'animate-spin' : ''}`} />
                <span>{syncingDrive ? 'Sincronizando com Google Drive...' : 'Sincronizar com Google Drive & Planilha Agora'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInstructions(!showInstructions)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 px-2.5 py-2 rounded-lg hover:bg-emerald-100/60 transition-colors cursor-pointer"
              >
                <span>Instruções (1 min)</span>
                {showInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Collapsible Instructions Box */}
            {showInstructions && (
              <div className="mt-3 p-3.5 bg-white border border-emerald-200 rounded-xl space-y-2.5 text-xs text-slate-700 animate-fade-in">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Como ativar no seu Google Drive em 4 passos:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="inline-flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer shadow-xs"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? 'Copiado!' : 'Copiar Código do Script'}</span>
                  </button>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600">
                  <li>
                    Acesse seu <strong>Google Drive</strong> e crie uma <strong>Planilha Google em branco</strong> com o nome que desejar (ex: <em>ConciliaPix - Controle</em>).
                  </li>
                  <li>
                    No menu superior da planilha, clique em <strong>Extensões &gt; Apps Script</strong>.
                  </li>
                  <li>
                    Apague o código existente, clique em <strong>"Copiar Código do Script"</strong> acima e cole lá.
                  </li>
                  <li>
                    Clique no botão azul <strong>Implantar &gt; Nova implantação</strong>.
                    <ul className="list-disc list-inside ml-4 mt-0.5 text-slate-500">
                      <li>Tipo: <strong>App da Web</strong></li>
                      <li>Quem pode acessar: <strong>Qualquer pessoa (Anyone)</strong></li>
                    </ul>
                  </li>
                  <li>
                    Copie a <strong>URL do app da Web</strong> gerada e cole no campo acima!
                  </li>
                </ol>
              </div>
            )}
          </div>

          {/* Download Backup */}
          <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                <Download className="w-4 h-4 text-blue-600" />
                <span>Baixar Cópia Manual de Segurança (.json)</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                Gera um arquivo JSON completo com todas as empresas, lançamentos, motoristas e acertos para seu computador.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadBackup}
              className="w-full mt-2 inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-xs transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Arquivo de Backup (.json)</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
