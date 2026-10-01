import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { api, formatCurrency, formatDate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Pencil,
  X,
  User,
  FileText,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Hash,
  Sparkles
} from 'lucide-react';

interface EditTransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [counterpartyName, setCounterpartyName] = useState('');
  const [counterpartyDoc, setCounterpartyDoc] = useState('');
  const [description, setDescription] = useState('');
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      setCounterpartyName(transaction.counterparty_name || '');
      setCounterpartyDoc(transaction.counterparty_doc || '');
      setDescription(transaction.description || '');
      setMemo(transaction.memo || '');
      setErrorMsg(null);
    }
  }, [transaction, isOpen]);

  if (!isOpen || !transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('A descrição do lançamento não pode ficar vazia.');
      return;
    }
    if (!currentUser) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await api.updateTransaction(
        transaction.id,
        {
          counterparty_name: counterpartyName.trim() || undefined,
          counterparty_doc: counterpartyDoc.trim() || undefined,
          description: description.trim(),
          memo: memo.trim() || undefined
        },
        currentUser
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar dados do lançamento.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyNameToDesc = () => {
    if (counterpartyName.trim()) {
      setDescription(`PIX RECEBIDO - ${counterpartyName.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-blue-50/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-2xl shadow-xs">
              <Pencil className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Editar Lançamento / Informar Remetente
              </h3>
              <p className="text-xs text-slate-500">
                Ação administrativa para adicionar ou corrigir o nome do pagador verificado no banco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Reference Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Dados Originais do Lançamento
              </span>
              <span
                className={`font-mono text-base font-extrabold ${
                  transaction.type === 'CREDIT' ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {transaction.type === 'CREDIT' ? '+' : '-'} {formatCurrency(transaction.amount)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-700 text-[11px] pt-1">
              <div>
                <span className="text-slate-400 text-[10px] block">Data:</span>
                <span className="font-semibold">{formatDate(transaction.date)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Banco:</span>
                <span className="font-semibold">{transaction.bank_name}</span>
              </div>
              {transaction.fitid && (
                <div className="col-span-2">
                  <span className="text-slate-400 text-[10px] block">FITID / Documento:</span>
                  <span className="font-mono text-[10px] text-slate-600 break-all">{transaction.fitid}</span>
                </div>
              )}
            </div>
          </div>

          {/* Field 1: Counterparty Name */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <User className="w-4 h-4 text-blue-600" />
                <span>Nome do Remetente / Pagador (Contraparte):</span>
              </label>
              {counterpartyName && (
                <button
                  type="button"
                  onClick={handleCopyNameToDesc}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Aplicar na Descrição</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="Ex: JOÃO DA SILVA ALIMENTOS ME ou MARIA DE SOUZA"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 shadow-2xs"
            />
            <p className="text-[10px] text-slate-500">
              Nome de quem realizou a transferência/Pix (conferido no comprovante ou internet banking).
            </p>
          </div>

          {/* Field 2: Counterparty Document (CPF/CNPJ) */}
          <div className="space-y-1">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-blue-600" />
              <span>CPF / CNPJ ou Chave Pix do Pagador (Opcional):</span>
            </label>
            <input
              type="text"
              value={counterpartyDoc}
              onChange={(e) => setCounterpartyDoc(e.target.value)}
              placeholder="Ex: 12.345.678/0001-90 ou 11999998888"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white shadow-2xs"
            />
          </div>

          {/* Field 3: Description */}
          <div className="space-y-1">
            <label className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Descrição / Histórico Exibido na Tabela:</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do lançamento..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 shadow-2xs"
            />
          </div>

          {/* Field 4: Memo */}
          <div className="space-y-1">
            <label className="font-bold text-slate-800 block">
              Observação Adicional / MEMO (Opcional):
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Ex: Verificado no extrato do Itaú Empresa referente ao pedido nº 4902..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white shadow-2xs resize-none"
            />
          </div>

          {/* Audit Notice */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 flex items-start space-x-2 text-[11px] leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <strong>Auditoria e Rastreabilidade:</strong>
              <p className="mt-0.5 text-slate-600">
                Esta alteração será registrada no log de auditoria com seu usuário (<strong>{currentUser?.name}</strong>), garantindo transparência e segurança contábil.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md shadow-blue-600/20 inline-flex items-center space-x-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
