import React, { useState } from 'react';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import { Truck, CheckCheck, XCircle, FileText, AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatPlate } from '../services/api';

interface DriverSessionBarProps {
  onOpenFinishModal: () => void;
}

export const DriverSessionBar: React.FC<DriverSessionBarProps> = ({ onOpenFinishModal }) => {
  const {
    isSessionActive,
    activeDriver,
    selectedTxIds,
    totalSelectedAmount,
    cancelSession,
    clearSelection,
    sessionNotes,
    setSessionNotes,
    generalVoucher,
    setGeneralVoucher
  } = useReconciliationSession();

  const [isExpanded, setIsExpanded] = useState(false);

  if (!isSessionActive || !activeDriver) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 via-white to-blue-50/70 border-b border-blue-200 shadow-sm sticky top-14 z-20 transition-all">
      <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left: Driver info & state */}
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2.5 rounded-xl text-white shadow-md shadow-blue-500/20">
              <Truck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
                  Sessão Ativa
                </span>
                <span className="text-xs text-slate-700 font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                  Placa: {formatPlate(activeDriver.vehicle_plate)}
                </span>
                {activeDriver.route && (
                  <span className="text-xs text-slate-600 hidden sm:inline font-medium">
                    • {activeDriver.route}
                  </span>
                )}
              </div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5 mt-0.5">
                <span className="text-slate-600 font-normal">Conciliando para:</span>
                <span className="text-blue-700 font-bold underline decoration-blue-400 decoration-2 underline-offset-4">
                  {activeDriver.name}
                </span>
              </h2>
            </div>
          </div>

          {/* Center: Live Selected Counters */}
          <div className="flex items-center bg-white border border-blue-200 rounded-xl px-4 py-2 space-x-6 shadow-xs">
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold">Pix Selecionados</p>
              <p className="text-lg font-extrabold text-slate-900">
                {selectedTxIds.length} <span className="text-xs font-normal text-slate-500">itens</span>
              </p>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase font-bold">Valor Total Acerto</p>
              <p className="text-lg font-extrabold text-emerald-600">
                {formatCurrency(totalSelectedAmount)}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl transition-colors flex items-center space-x-1 font-semibold"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>{isExpanded ? 'Ocultar Detalhes' : 'Nº Canhoto / Obs'}</span>
            </button>

            {selectedTxIds.length > 0 && (
              <button
                onClick={clearSelection}
                className="text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2.5 py-2 rounded-xl transition-colors font-medium"
                title="Desmarcar seleções"
              >
                Limpar
              </button>
            )}

            <button
              onClick={cancelSession}
              className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200 bg-white px-3 py-2 rounded-xl transition-colors flex items-center space-x-1 font-semibold cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancelar</span>
            </button>

            <button
              onClick={onOpenFinishModal}
              disabled={selectedTxIds.length === 0}
              className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                selectedTxIds.length > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/30 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <CheckCheck className="w-4 h-4" />
              <span>Finalizar & Encerrar ({selectedTxIds.length})</span>
            </button>
          </div>
        </div>

        {/* Collapsible Details */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-blue-200/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Nº de Comprovante Geral / Lote de Canhotos
              </label>
              <input
                type="text"
                placeholder="Ex: LOTE-CARGA-8821 ou RECIBO-MOTORISTA-44"
                value={generalVoucher}
                onChange={(e) => setGeneralVoucher(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">
                Observações deste Acerto
              </label>
              <input
                type="text"
                placeholder="Ex: Conferido fisicamente com 3 canhotos assinados na portaria"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
