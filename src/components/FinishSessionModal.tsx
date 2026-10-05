import React, { useState } from 'react';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import {
  CheckCheck,
  Truck,
  FileCheck2,
  AlertTriangle,
  X,
  Receipt,
  Printer,
  Lock
} from 'lucide-react';
import { formatCurrency, formatPlate, formatDate } from '../services/api';
import { LicensePlateBadge } from './LicensePlateBadge';

interface FinishSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: { sessionId: string; driverName: string; itemCount: number; totalAmount: number; missingAmount?: number }) => void;
}

export const FinishSessionModal: React.FC<FinishSessionModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const {
    activeDriver,
    selectedTransactions,
    totalSelectedAmount,
    voucherNumbers,
    setVoucherForTx,
    generalVoucher,
    setGeneralVoucher,
    sessionNotes,
    setSessionNotes,
    missingAmount,
    setMissingAmount,
    finishSession,
    isSubmitting
  } = useReconciliationSession();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !activeDriver) return null;

  const handleFinish = async () => {
    try {
      setErrorMsg(null);
      const res = await finishSession();
      onSuccess(res);
      onClose();
    } catch (err: any) {
      if (err.conflictTx) {
        setErrorMsg(
          `Conflito de conciliação: Uma das transações já foi conciliada em outro terminal. O sistema barrou a duplicação para manter a integridade dos dados!`
        );
      } else {
        setErrorMsg(err.message || 'Falha ao encerrar a conciliação.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl text-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-700 border border-blue-200">
              <CheckCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Finalizar & Encerrar Conciliação</h3>
              <p className="text-xs text-slate-500">
                Os recebimentos selecionados serão travados permanentemente para este motorista
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Driver & Totals Summary Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center border border-blue-200 shadow-xs">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] text-blue-800 uppercase font-extrabold">Motorista Vinculado</p>
                <h4 className="text-base font-extrabold text-slate-900">{activeDriver.name}</h4>
                <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                  <span className="flex items-center gap-2">
                    Placa: <LicensePlateBadge plate={activeDriver.vehicle_plate} className="scale-75 origin-left" />
                  </span>
                  {activeDriver.route && <span>• {activeDriver.route}</span>}
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-right shadow-xs">
              <p className="text-[10px] text-slate-500 uppercase font-bold">Total Pix Conferido</p>
              <p className="text-xl font-extrabold text-emerald-600">
                {formatCurrency(totalSelectedAmount)}
              </p>
              <p className="text-[11px] text-slate-600 font-bold">
                {selectedTransactions.length} transações selecionadas
              </p>
            </div>
          </div>

          {/* NOVO CAMPO: Valor Faltante da Prestação de Contas */}
          <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-amber-500 text-white rounded-lg">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-950">
                    Valor Faltante da Prestação de Contas (R$):
                  </label>
                  <p className="text-[11px] text-amber-800">
                    Informe caso o motorista tenha entregue a prestação com diferença faltante ou débito pendente.
                  </p>
                </div>
              </div>

              {missingAmount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-red-100 text-red-700 border border-red-200">
                  Débito Registrado
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0,00"
                    value={missingAmount || ''}
                    onChange={(e) => setMissingAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-white border border-amber-300 rounded-xl pl-9 pr-3.5 py-2 text-sm font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-2xs"
                  />
                </div>
              </div>

              <div className="bg-white border border-amber-200/80 rounded-xl p-2.5 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Pix Conferido:</span>
                  <span className="font-mono font-bold text-emerald-600">{formatCurrency(totalSelectedAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor Faltante:</span>
                  <span className={`font-mono font-bold ${missingAmount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {formatCurrency(missingAmount)}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-1">
                  <span>Prestação Total Esperada:</span>
                  <span className="font-mono">{formatCurrency(totalSelectedAmount + missingAmount)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* General Voucher Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Nº Geral do Comprovante / Canhoto / Recibo:
              </label>
              <input
                type="text"
                placeholder="Ex: RECIBO-CARGA-9912 ou NFE-8819"
                value={generalVoucher}
                onChange={(e) => setGeneralVoucher(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Será gravado nos Pix selecionados como comprovante fiscal de acerto.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Observações de Fechamento:
              </label>
              <input
                type="text"
                placeholder="Ex: Acerto conferido com canhoto assinado na portaria"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>
          </div>

          {/* List of Transactions being reconciled */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Transações Pix Selecionadas ({selectedTransactions.length}):
            </label>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50">
              {selectedTransactions.map((tx) => (
                <div key={tx.id} className="p-2.5 flex items-center justify-between text-xs bg-white hover:bg-slate-50">
                  <div className="space-y-0.5 max-w-[65%]">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-slate-500">{formatDate(tx.date)}</span>
                      <span className="font-bold text-slate-900 truncate">{tx.description}</span>
                    </div>
                    {tx.memo && <p className="text-[11px] text-slate-500 truncate">{tx.memo}</p>}
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="text"
                      placeholder="Nº Canhoto"
                      value={voucherNumbers[tx.id] || ''}
                      onChange={(e) => setVoucherForTx(tx.id, e.target.value)}
                      className="w-24 bg-white border border-slate-300 rounded px-2 py-1 text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                      title="Nº Comprovante / Canhoto específico"
                    />
                    <span className="font-mono font-extrabold text-emerald-600">
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security & Lock Warning */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-blue-900">
            <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-blue-950 font-bold">Trava Antifraude & Bloqueio Permanente:</strong>
              <p className="text-blue-900/80 mt-0.5">
                Ao clicar em encerrar, estas transações serão marcadas como <strong>CONCILIADAS</strong> e
                ficarão bloqueadas para seleção por qualquer usuário do sistema, impedindo duplicações.
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-xs text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {selectedTransactions.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center space-x-2 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Nenhum Pix selecionado. O acerto será fechado registrando o valor faltante informado.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
          >
            Voltar e Revisar
          </button>

          <button
            onClick={handleFinish}
            disabled={isSubmitting || (selectedTransactions.length === 0 && missingAmount <= 0)}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all ${
              !isSubmitting && (selectedTransactions.length > 0 || missingAmount > 0)
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Gravando e Bloqueando...</span>
              </>
            ) : (
              <>
                <CheckCheck className="w-4 h-4" />
                <span>Confirmar & Encerrar Conciliação</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
