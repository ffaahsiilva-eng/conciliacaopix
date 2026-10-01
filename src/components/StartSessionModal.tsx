import React, { useState } from 'react';
import { Driver } from '../types';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import { Truck, Search, X, Check, ArrowRight, UserPlus, AlertCircle } from 'lucide-react';
import { formatPlate } from '../services/api';

interface StartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  drivers: Driver[];
  onOpenNewDriver: () => void;
}

export const StartSessionModal: React.FC<StartSessionModalProps> = ({
  isOpen,
  onClose,
  drivers,
  onOpenNewDriver
}) => {
  const { startSession } = useReconciliationSession();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredDrivers = drivers.filter((d) => {
    if (d.active === 0) return false;
    const q = searchTerm.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.vehicle_plate.toLowerCase().includes(q) ||
      (d.route && d.route.toLowerCase().includes(q))
    );
  });

  const handleStart = async () => {
    if (!selectedDriver) {
      setErrorMsg('Por favor selecione um motorista para iniciar a conciliação.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      await startSession(selectedDriver, notes);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao iniciar sessão.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl text-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-700 border border-blue-200">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Iniciar Conciliação por Motorista</h3>
              <p className="text-xs text-slate-500">
                Selecione o motorista para vincular os comprovantes físicos aos recebimentos Pix
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

        <div className="p-6 space-y-4">
          {/* Driver Search */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Selecione o Motorista que trouxe os comprovantes:
              </label>
              <button
                type="button"
                onClick={onOpenNewDriver}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center space-x-1 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Cadastrar Novo</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, placa, código ou rota..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white shadow-xs"
              />
            </div>
          </div>

          {/* Drivers List */}
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50">
            {filteredDrivers.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-6">
                Nenhum motorista encontrado com os termos pesquisados.
              </p>
            ) : (
              filteredDrivers.map((driver) => {
                const isSelected = selectedDriver?.id === driver.id;
                return (
                  <div
                    key={driver.id}
                    onClick={() => setSelectedDriver(driver)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs font-semibold'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-xs ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {driver.code.replace('MOT-', '')}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{driver.name}</span>
                          <span className="font-mono text-[11px] bg-slate-100 text-blue-800 px-1.5 py-0.5 rounded border border-slate-200">
                            {formatPlate(driver.vehicle_plate)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                          {driver.route && <span>Rota: {driver.route}</span>}
                          {driver.phone && <span>• Tel: {driver.phone}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-slate-300"></div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Session Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observação / Lote de Acerto (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ex: Acerto Carga 223 - Canhotos Rota Centro"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-xs"
            />
          </div>

          {/* Flow explanation */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 space-y-1">
            <p className="font-bold text-blue-950">Como funciona o acerto:</p>
            <p>1. O motorista selecionado fica ativo em destaque no topo da tela.</p>
            <p>2. Você marca os recebimentos Pix correspondentes aos canhotos entregues.</p>
            <p>3. Ao finalizar, o sistema trava as transações e você já pode chamar o próximo motorista!</p>
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
          >
            Cancelar
          </button>

          <button
            onClick={handleStart}
            disabled={!selectedDriver || loading}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all ${
              selectedDriver && !loading
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <span>Iniciando...</span>
            ) : (
              <>
                <span>Iniciar Conciliação</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
