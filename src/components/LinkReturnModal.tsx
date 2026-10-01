import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { api, formatCurrency, formatDate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  ArrowRight,
  ShieldAlert,
  Lock,
  Calendar,
  User,
  FileText
} from 'lucide-react';

interface LinkReturnModalProps {
  debitTx: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LinkReturnModal: React.FC<LinkReturnModalProps> = ({
  debitTx,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuth();
  const [candidates, setCandidates] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCreditId, setSelectedCreditId] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState('');
  const [reason, setReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !debitTx) {
      setCandidates([]);
      setSelectedCreditId('');
      setReason('');
      setErrorMsg(null);
      return;
    }

    const loadCandidates = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await api.getReturnCandidates(debitTx.id);
        setCandidates(res.candidates || []);
        // If there's an exact match on amount, preselect it
        const exact = res.candidates?.find((c) => Math.abs(c.amount - debitTx.amount) < 0.01);
        if (exact) {
          setSelectedCreditId(exact.id);
        } else if (res.candidates && res.candidates.length > 0) {
          setSelectedCreditId(res.candidates[0].id);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Falha ao buscar candidatos para vinculação de devolução.');
      } finally {
        setLoading(false);
      }
    };

    loadCandidates();
  }, [isOpen, debitTx]);

  if (!isOpen || !debitTx) return null;

  const filteredCandidates = candidates.filter((c) => {
    if (!searchFilter.trim()) return true;
    const rawQ = searchFilter.toLowerCase().trim();
    const cleanQ = rawQ.replace(/^r\$\s*/, '').replace(/\./g, '').replace(',', '.');
    const parsedQ = parseFloat(cleanQ);

    const orig = c.original_amount !== null && c.original_amount !== undefined ? Number(c.original_amount) : Number(c.amount);
    const matchesAmount = !isNaN(parsedQ) && (
      Math.abs(c.amount - parsedQ) < 0.01 ||
      Math.abs(orig - parsedQ) < 0.01 ||
      c.amount.toString().includes(cleanQ) ||
      orig.toString().includes(cleanQ) ||
      c.amount.toFixed(2).replace('.', ',').includes(rawQ)
    );

    return (
      matchesAmount ||
      c.description.toLowerCase().includes(rawQ) ||
      (c.counterparty_name && c.counterparty_name.toLowerCase().includes(rawQ)) ||
      (c.counterparty_doc && c.counterparty_doc.toLowerCase().includes(rawQ)) ||
      (c.document_number && c.document_number.toLowerCase().includes(rawQ)) ||
      (c.fitid && c.fitid.toLowerCase().includes(rawQ))
    );
  });

  const selectedCredit = candidates.find((c) => c.id === selectedCreditId);
  const selectedCreditAmount = selectedCredit ? (selectedCredit.original_amount || selectedCredit.amount) : 0;
  const isPartialReturn = selectedCredit ? debitTx.amount < selectedCreditAmount : false;
  const netAmountAfterReturn = selectedCredit ? Math.max(0, selectedCreditAmount - debitTx.amount) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCreditId) {
      setErrorMsg('Selecione uma entrada de Pix para vincular a esta saída de devolução.');
      return;
    }
    if (!currentUser) return;

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await api.linkPixReturn({
        debitTxId: debitTx.id,
        creditTxId: selectedCreditId,
        returnedAmount: debitTx.amount,
        reason: reason.trim() || undefined,
        actorUser: currentUser
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao vincular devolução.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Relacionar Saída de Devolução a uma Entrada
              </h3>
              <p className="text-xs text-slate-500">
                Suporta devolução total (bloqueio do Pix) ou parcial (abate do valor estornado)
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Box 1: Saída (Débito do Extrato) */}
          <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-red-800">
                Lançamento de Saída (Estorno / Devolução no Extrato)
              </span>
              <span className="font-mono text-base font-extrabold text-red-700">
                - {formatCurrency(debitTx.amount)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700 pt-1">
              <div>
                <span className="text-slate-400 text-[10px] block">Data do Débito:</span>
                <span className="font-semibold">{formatDate(debitTx.date)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Banco / Lote:</span>
                <span className="font-semibold">{debitTx.bank_name}</span>
              </div>
              {debitTx.counterparty_name && (
                <div className="sm:col-span-2">
                  <span className="text-slate-400 text-[10px] block">Destinatário / Favorecido:</span>
                  <span className="font-bold text-slate-900">{debitTx.counterparty_name}</span>
                </div>
              )}
              <div className="sm:col-span-2">
                <span className="text-slate-400 text-[10px] block">Histórico Completo do Arquivo:</span>
                <p className="font-mono text-[11px] text-slate-800 break-words bg-white/70 p-2 rounded-lg border border-red-100">
                  {debitTx.description}
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Candidate Entries to Link */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <ArrowRight className="w-4 h-4 text-blue-600" />
                <span>Selecione a Entrada de Pix original depositada pelo cliente:</span>
              </label>
              <span className="text-[11px] text-slate-500">
                {candidates.length} candidatas encontradas
              </span>
            </div>

            {/* Candidate Search */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filtrar por nome de quem pagou, descrição ou valor..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p>Buscando entradas correspondentes no extrato...</p>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500">
                <p className="font-bold">Nenhuma entrada pendente encontrada com esses critérios.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Certifique-se de que o arquivo com os créditos de Pix recebidos foi importado.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {filteredCandidates.map((c) => {
                  const isSelected = c.id === selectedCreditId;
                  const candidateOriginal = c.original_amount || c.amount;
                  const isExactAmount = Math.abs(candidateOriginal - debitTx.amount) < 0.01;
                  const isPartial = debitTx.amount < candidateOriginal;

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCreditId(c.id)}
                      className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-extrabold text-emerald-700">
                              + {formatCurrency(candidateOriginal)}
                            </span>
                            {isExactAmount ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                                ✓ Devolução Total (100%)
                              </span>
                            ) : isPartial ? (
                              <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-300">
                                ✂ Devolução Parcial (Abate {formatCurrency(debitTx.amount)})
                              </span>
                            ) : null}
                            <span className="text-[11px] text-slate-500 font-medium">
                              Data: {formatDate(c.date)}
                            </span>
                          </div>

                          {c.counterparty_name && (
                            <div className="text-xs font-bold text-slate-900 mt-0.5">
                              Pagador: {c.counterparty_name}
                            </div>
                          )}

                          <p className="font-mono text-[10px] text-slate-600 break-words mt-0.5">
                            {c.description}
                          </p>
                        </div>

                        <div className="shrink-0 flex items-center">
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2.5: Result Preview Banner */}
          {selectedCredit && (
            <div className={`p-4 rounded-2xl border space-y-1.5 ${
              isPartialReturn
                ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {isPartialReturn ? 'Resultado do Vínculo: Devolução Parcial de Pix' : 'Resultado do Vínculo: Devolução Total de Pix'}
                  </span>
                </span>
                <span className="font-mono text-sm font-extrabold text-blue-800">
                  {isPartialReturn ? `Saldo a Conciliar: ${formatCurrency(netAmountAfterReturn)}` : 'Bloqueio Integral'}
                </span>
              </div>

              {isPartialReturn ? (
                <div className="text-[11px] space-y-1 pt-1 text-slate-700">
                  <div className="flex items-center justify-between font-mono">
                    <span>Valor Original Depositado:</span>
                    <strong className="text-slate-900">{formatCurrency(selectedCreditAmount)}</strong>
                  </div>
                  <div className="flex items-center justify-between font-mono text-red-700">
                    <span>(-) Devolução / Estorno ao Cliente:</span>
                    <strong>- {formatCurrency(debitTx.amount)}</strong>
                  </div>
                  <div className="flex items-center justify-between font-mono font-bold text-emerald-800 border-t border-blue-200 pt-1">
                    <span>(=) Saldo Líquido Disponível para o Motorista:</span>
                    <span className="text-sm">{formatCurrency(netAmountAfterReturn)}</span>
                  </div>
                  <p className="text-[10px] text-blue-800 pt-1 font-medium">
                    ✓ A transação de entrada <strong>não será bloqueada</strong>; ela continuará disponível para o operador conciliar com o motorista pelo valor líquido de <strong>{formatCurrency(netAmountAfterReturn)}</strong>.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-amber-800">
                  A entrada de {formatCurrency(selectedCreditAmount)} será <strong>bloqueada integralmente</strong> com o status <strong>RETURNED</strong>, evitando conciliação indevida.
                </p>
              )}
            </div>
          )}

          {/* Section 3: Reason / Note */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Motivo / Observação do Estorno (opcional):
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Devolução parcial por cancelamento de item / diferença de pedido"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer Actions */}
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
              disabled={submitting || !selectedCreditId}
              className={`text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md inline-flex items-center space-x-2 disabled:opacity-50 ${
                isPartialReturn
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Processando...'
                  : isPartialReturn
                  ? `Confirmar Devolução Parcial (Saldo: ${formatCurrency(netAmountAfterReturn)})`
                  : 'Confirmar Devolução Total e Bloquear'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
