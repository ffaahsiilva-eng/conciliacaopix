import React, { useState } from 'react';
import { Transaction } from '../types';
import { formatCurrency, formatDate, formatDateTime, api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  X,
  User,
  Building2,
  Calendar,
  Lock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Code,
  ShieldCheck,
  Truck,
  Hash,
  EyeOff,
  Pencil
} from 'lucide-react';

interface TransactionDetailsModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onOpenLinkReturn?: (tx: Transaction) => void;
  onOpenEdit?: (tx: Transaction) => void;
}

export const TransactionDetailsModal: React.FC<TransactionDetailsModalProps> = ({
  transaction,
  isOpen,
  onClose,
  onUpdated,
  onOpenLinkReturn,
  onOpenEdit
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [unlinking, setUnlinking] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  if (!isOpen || !transaction) return null;

  const isCredit = transaction.type === 'CREDIT';
  const isReturned = transaction.status === 'RETURNED' || transaction.is_pix_return === 1;

  const handleUnlink = async () => {
    if (!confirm('Deseja realmente desvincular este estorno? O lançamento voltará ao status Pendente e será desbloqueado.')) {
      return;
    }
    try {
      setUnlinking(true);
      await api.unlinkPixReturn(transaction.id, currentUser || undefined);
      setActionMsg('Estorno desvinculado com sucesso! Lançamento desbloqueado.');
      setTimeout(() => {
        setActionMsg(null);
        if (onUpdated) onUpdated();
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Erro ao desvincular estorno.');
    } finally {
      setUnlinking(false);
    }
  };

  let parsedRaw: any = null;
  if (transaction.raw_data) {
    try {
      parsedRaw = JSON.parse(transaction.raw_data);
    } catch {
      parsedRaw = transaction.raw_data;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div
              className={`p-2.5 rounded-2xl ${
                isCredit ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Detalhamento Completo do Lançamento
                </h3>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isReturned
                      ? 'bg-red-100 text-red-800 border-red-300'
                      : transaction.status === 'RECONCILED'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : transaction.status === 'IGNORED'
                      ? 'bg-slate-200 text-slate-700 border-slate-300'
                      : 'bg-blue-100 text-blue-800 border-blue-300'
                  }`}
                >
                  {isReturned
                    ? 'BLOQUEADA / DEVOLVIDA'
                    : transaction.status === 'RECONCILED'
                    ? 'CONCILIADA'
                    : transaction.status === 'IGNORED'
                    ? 'DESCONSIDERADA'
                    : 'PENDENTE'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">ID: {transaction.id}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {actionMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{actionMsg}</span>
            </div>
          )}

          {/* Highlights Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                {transaction.returned_amount && transaction.returned_amount > 0 && !isReturned
                  ? 'Saldo Líquido a Conciliar'
                  : 'Valor do Lançamento'}
              </span>
              <span
                className={`font-mono text-xl font-black ${
                  isCredit ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {isCredit ? '+' : '-'} {formatCurrency(transaction.amount)}
              </span>

              {transaction.returned_amount && transaction.returned_amount > 0 && (
                <div className="mt-1 pt-1 border-t border-slate-200 text-[11px] font-mono space-y-0.5">
                  <div className="text-slate-600">
                    Original: <strong>{formatCurrency(transaction.original_amount || transaction.amount + transaction.returned_amount)}</strong>
                  </div>
                  <div className="text-red-700 font-bold">
                    Estorno/Devolução: <strong>- {formatCurrency(transaction.returned_amount)}</strong>
                  </div>
                </div>
              )}

              <span className="text-[11px] text-slate-500 block mt-1">
                Tipo: <strong>{isCredit ? 'Crédito (Entrada)' : 'Débito (Saída)'}</strong>
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Data do Lançamento
              </span>
              <span className="font-mono text-base font-extrabold text-slate-900">
                {formatDate(transaction.date)}
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Banco: <strong>{transaction.bank_name}</strong>
              </span>
            </div>
          </div>

          {/* Clear Payer / Counterparty Highlight */}
          <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700 block">
                Nome de quem realizou a transação (Contraparte / Pagador)
              </span>
              {isAdmin && onOpenEdit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEdit(transaction);
                  }}
                  className="text-blue-700 hover:text-blue-900 font-bold text-[11px] hover:underline cursor-pointer inline-flex items-center gap-1"
                  title="Editar nome do remetente verificado no banco"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Editar / Informar Nome</span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2 text-slate-900">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-extrabold text-slate-900 block">
                  {transaction.counterparty_name || 'Não identificado explicitamente na descrição'}
                </span>
                {transaction.counterparty_doc && (
                  <span className="text-xs font-mono text-blue-700 font-bold">
                    Documento: {transaction.counterparty_doc}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Full un-truncated description and memo */}
          <div className="space-y-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Histórico Completo do Arquivo Importado (Sem cortes):
              </label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-800 whitespace-pre-wrap break-all leading-relaxed select-all">
                {transaction.description}
              </div>
            </div>

            {transaction.memo && transaction.memo !== transaction.description && (
              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Campo MEMO / Detalhes Adicionais:
                </label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-800 break-words select-all">
                  {transaction.memo}
                </div>
              </div>
            )}
          </div>

          {/* Identification Codes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
            <div>
              <span className="text-slate-400 text-[10px] block">Identificador Único (FITID):</span>
              <span className="font-mono text-slate-800 font-semibold break-all">
                {transaction.fitid || '-'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block">Número do Documento:</span>
              <span className="font-mono text-slate-800 font-semibold break-all">
                {transaction.document_number || '-'}
              </span>
            </div>
          </div>

          {/* Return status box if returned */}
          {isReturned && (
            <div className="bg-red-50 border border-red-300 rounded-2xl p-4 space-y-2">
              <div className="flex items-center space-x-2 text-red-900 font-bold">
                <Lock className="w-4 h-4 text-red-700" />
                <span>Lançamento Bloqueado por Devolução de Pix</span>
              </div>
              <p className="text-slate-700 leading-relaxed text-[11px]">
                {transaction.return_reason ||
                  'Este lançamento foi identificado como estornado e está bloqueado contra qualquer conciliação com motoristas.'}
              </p>

              {transaction.linked_tx_id && (
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-slate-500 font-mono text-[10px]">
                    ID da transação cruzada: {transaction.linked_tx_id}
                  </span>
                  <button
                    onClick={handleUnlink}
                    disabled={unlinking}
                    className="bg-white hover:bg-red-100 text-red-800 border border-red-300 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                  >
                    {unlinking ? 'Desvinculando...' : 'Desvincular Devolução'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Reconciliation data if reconciled */}
          {transaction.status === 'RECONCILED' && transaction.driver_name && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-1.5">
              <div className="flex items-center space-x-2 text-emerald-900 font-bold">
                <Truck className="w-4 h-4 text-emerald-700" />
                <span>Conciliado com Motorista</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1">
                <div>
                  <span className="text-slate-400 block">Motorista:</span>
                  <strong className="text-slate-900">{transaction.driver_name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Placa:</span>
                  <strong className="font-mono text-slate-900">{transaction.driver_plate || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Conciliado Por:</span>
                  <span>{transaction.reconciled_by_user_name || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Data de Conciliação:</span>
                  <span>{transaction.reconciled_at ? formatDateTime(transaction.reconciled_at) : '-'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Raw File Data Accordion */}
          <div className="pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="text-slate-500 hover:text-slate-800 font-semibold flex items-center space-x-1.5 cursor-pointer text-[11px]"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{showRaw ? 'Ocultar dados brutos do arquivo' : 'Ver todos os dados brutos do arquivo (OFX/CSV)'}</span>
            </button>

            {showRaw && (
              <div className="mt-2 bg-slate-900 text-slate-200 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48">
                {parsedRaw ? (
                  <pre>{JSON.stringify(parsedRaw, null, 2)}</pre>
                ) : (
                  <p className="text-slate-400">Nenhum dado bruto adicional armazenado.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Fechar
          </button>

          <div className="flex items-center space-x-2">
            {isAdmin && onOpenEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEdit(transaction);
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                title="Editar descrição e remetente"
              >
                <Pencil className="w-3.5 h-3.5 text-blue-600" />
                <span>Editar Remetente / Descrição</span>
              </button>
            )}

            {!isCredit && transaction.status === 'PENDING' && onOpenLinkReturn && (
              <button
                onClick={() => {
                  onClose();
                  onOpenLinkReturn(transaction);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Relacionar esta Saída a uma Entrada</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
