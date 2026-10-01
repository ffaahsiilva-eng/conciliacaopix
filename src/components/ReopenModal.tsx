import React, { useState } from 'react';
import { Transaction } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { LockOpen, AlertTriangle, X } from 'lucide-react';
import { formatCurrency, formatDate } from '../services/api';

interface ReopenModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  onSuccess: () => void;
}

export const ReopenModal: React.FC<ReopenModalProps> = ({
  isOpen,
  onClose,
  transaction,
  onSuccess
}) => {
  const { currentUser } = useAuth();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !transaction) return null;

  const handleReopen = async () => {
    if (!reason.trim()) {
      setErrorMsg('A justificativa da auditoria é obrigatória para reabrir.');
      return;
    }
    if (!currentUser || currentUser.role !== 'ADMIN') {
      setErrorMsg('Apenas Administradores possuem permissão para reabrir conciliações.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      await api.reopenTransaction(transaction.id, reason.trim(), currentUser);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao reabrir transação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-100 p-2 rounded-xl text-amber-700 border border-amber-200">
              <LockOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Reabrir Conciliação</h3>
              <p className="text-[11px] text-slate-500">Ação administrativa auditada</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
            <p className="font-bold text-slate-900">{transaction.description}</p>
            <p className="text-emerald-600 font-mono font-extrabold text-sm">
              {formatCurrency(transaction.amount)} • {formatDate(transaction.date)}
            </p>
            <p className="text-slate-600 text-[11px]">
              Conciliado por: <strong className="text-slate-800">{transaction.reconciled_by_user_name}</strong>
              <br />
              Motorista vinculado:{' '}
              <strong className="text-blue-700">
                {transaction.driver_name} ({transaction.driver_plate})
              </strong>
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Motivo do Estorno / Reabertura (Gravado na Auditoria) *
            </label>
            <textarea
              rows={3}
              placeholder="Ex: Comprovante entregue pelo motorista errado; será reatribuído na sessão correta."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl p-3 text-slate-900 focus:outline-none focus:border-amber-500 resize-none shadow-xs"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 cursor-pointer font-semibold"
          >
            Cancelar
          </button>

          <button
            onClick={handleReopen}
            disabled={loading}
            className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs shadow-xs transition-all cursor-pointer"
          >
            <LockOpen className="w-4 h-4" />
            <span>{loading ? 'Reabrindo...' : 'Confirmar e Desbloquear'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
