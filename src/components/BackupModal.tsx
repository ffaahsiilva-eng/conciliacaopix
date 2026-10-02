import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import {
  Download,
  Upload,
  Database,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  HardDrive,
  CloudCheck,
  ShieldAlert
} from 'lucide-react';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, isAdmin } = useAuth();
  const [dbStatus, setDbStatus] = useState<any>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await fetch('/api/database/status');
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data);
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
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadBackup = () => {
    window.location.href = '/api/database/backup';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoring(true);
    setRestoreMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        let backupData: any;
        try {
          backupData = JSON.parse(text);
        } catch (_) {
          throw new Error('O arquivo selecionado não é um JSON válido.');
        }

        const res = await fetch('/api/database/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backupData,
            actorUser: currentUser || { id: 'usr-admin', name: 'Administrador', role: 'ADMIN' }
          })
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Falha ao restaurar banco de dados.');
        }

        setRestoreMessage({
          type: 'success',
          text: json.message || 'Backup restaurado com sucesso! Recarregando sistema...'
        });

        fetchStatus();
      } catch (err: any) {
        setRestoreMessage({
          type: 'error',
          text: err.message || 'Arquivo de backup inválido ou com formato corrompido.'
        });
      } finally {
        setRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/30 rounded-xl text-blue-400 border border-blue-500/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-tight">Persistência & Backup de Dados</h3>
              <p className="text-[11px] text-slate-400">Armazenamento em Nuvem Supabase (Nuvem)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Cloud SQL Status Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-600" />
                Motor de Armazenamento
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {dbStatus?.cloudSqlActive ? 'Supabase (Nuvem) Ativo' : 'Conectando à Nuvem...'}
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Todos os lançamentos, motoristas, acertos e logs são gravados de forma segura e <strong>permanente no Supabase (Nuvem)</strong>. Seus dados nunca mais serão perdidos em reinicializações.
            </p>

            {dbStatus?.lastSync && (
              <p className="text-[11px] text-slate-400">
                Última sincronização na nuvem: {new Date(dbStatus.lastSync).toLocaleString('pt-BR')}
              </p>
            )}
          </div>

          {/* Restore alert message */}
          {restoreMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 border ${
                restoreMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : 'bg-red-50 text-red-900 border-red-300'
              }`}
            >
              {restoreMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span className="font-medium">{restoreMessage.text}</span>
            </div>
          )}

          {/* Action cards */}
          <div className="grid grid-cols-1 gap-3">
            {/* Download Backup */}
            <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Baixar Cópia (Backup)</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Gera um arquivo JSON completo com todas as empresas, lançamentos, motoristas e acertos.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadBackup}
                className="w-full mt-2 inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-lg text-xs shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Backup (.json)</span>
              </button>
            </div>

            {/* Restore Backup (OCULTADO) */}
            {false && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                  <Upload className="w-4 h-4 text-slate-600" />
                  <span>Restaurar Cópia</span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                  Carrega um arquivo de backup previamente exportado de volta para o sistema.
                </p>
              </div>

              <label className="w-full mt-2 inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold px-3 py-2 rounded-lg text-xs shadow-xs transition-all cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                <span>{restoring ? 'Restaurando...' : 'Carregar Arquivo'}</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  disabled={restoring}
                  className="hidden"
                />
              </label>
            </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
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
