import React, { useState } from 'react';
import { Driver } from '../types';
import { formatCurrency, formatPlate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import {
  Truck,
  Plus,
  Search,
  CheckCircle2,
  Phone,
  MapPin,
  Edit,
  ArrowRight,
  Building2,
  Store
} from 'lucide-react';

interface DriversViewProps {
  drivers: Driver[];
  onOpenNewDriver: () => void;
  onEditDriver: (driver: Driver) => void;
  onStartSessionForDriver: (driver: Driver) => void;
}

export const DriversView: React.FC<DriversViewProps> = ({
  drivers,
  onOpenNewDriver,
  onEditDriver,
  onStartSessionForDriver
}) => {
  const { canReconcile } = useAuth();
  const { currentCompany } = useCompany();
  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';
  const { isSessionActive, activeDriver } = useReconciliationSession();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const filtered = drivers.filter((d) => {
    if (statusFilter === 'ACTIVE' && d.active === 0) return false;
    if (statusFilter === 'INACTIVE' && d.active === 1) return false;
    const q = searchTerm.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.vehicle_plate.toLowerCase().includes(q) ||
      (d.route && d.route.toLowerCase().includes(q))
    );
  });

  const totalReconciledAll = drivers.reduce(
    (acc, d) => acc + (d.total_reconciled_amount || 0),
    0
  );
  const totalPixCountAll = drivers.reduce(
    (acc, d) => acc + (d.total_reconciled_pix_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">Motoristas Cadastrados</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{drivers.length}</p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
              {drivers.filter((d) => d.active === 1).length} ativos para acertos
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">Total de Pix Acertados</p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">
              {formatCurrency(totalReconciledAll)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {totalPixCountAll} comprovantes conferidos
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-100 font-bold">Cadastro de Frota</p>
            <p className="text-xs text-blue-50 mt-1">
              Cadastre novos motoristas com veículo e rota
            </p>
            <button
              onClick={onOpenNewDriver}
              className="mt-2 inline-flex items-center space-x-1.5 bg-white text-blue-800 hover:bg-blue-50 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Motorista</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por nome, placa do veículo, código ou rota..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="ACTIVE">Apenas Ativos</option>
            <option value="ALL">Todos os Status</option>
            <option value="INACTIVE">Inativos</option>
          </select>

          <button
            onClick={onOpenNewDriver}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors whitespace-nowrap shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Motorista</span>
          </button>
        </div>
      </div>

      {/* Drivers Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3 shadow-xs">
            <Truck className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-base font-bold text-slate-800">Nenhum motorista encontrado</h4>
            <p className="text-xs text-slate-500">Tente ajustar a busca ou cadastre um novo motorista.</p>
          </div>
        ) : (
          filtered.map((driver) => {
            const isCurrentlyReconciling = isSessionActive && activeDriver?.id === driver.id;

            return (
              <div
                key={driver.id}
                className={`bg-white border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between ${
                  isCurrentlyReconciling
                    ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  {/* Top Bar in Card */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 font-extrabold flex items-center justify-center text-sm border border-blue-200">
                        {driver.code.replace('MOT-', '')}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 leading-tight">{driver.name}</h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-blue-800 border border-slate-200">
                            {formatPlate(driver.vehicle_plate)}
                          </span>
                          {driver.active === 0 && (
                            <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.2 rounded font-bold">
                              Inativo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => onEditDriver(driver)}
                      className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                      title="Editar cadastro do motorista"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Vehicle & Route details */}
                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    {driver.vehicle_model && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{driver.vehicle_model}</span>
                      </div>
                    )}
                    {driver.route && (
                      <div className="text-[11px] text-slate-700 font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span className="truncate">{driver.route}</span>
                      </div>
                    )}
                    {driver.phone && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{driver.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Conciliation performance stats */}
                  <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Pix Acertados</p>
                      <p className="text-sm font-extrabold text-emerald-600 mt-0.5">
                        {formatCurrency(driver.total_reconciled_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Qtd. / Acertos</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5">
                        {driver.total_reconciled_pix_count || 0}{' '}
                        <span className="text-[10px] text-slate-500 font-normal">
                          ({driver.total_sessions || 0} sessões)
                        </span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bottom Action */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {isCurrentlyReconciling ? (
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold py-2 px-3 rounded-xl text-center flex items-center justify-center space-x-1.5">
                      <Truck className="w-4 h-4 animate-pulse text-amber-600" />
                      <span>Sessão Ativa no Topo</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => onStartSessionForDriver(driver)}
                      disabled={driver.active === 0 || !canReconcile}
                      className={`w-full flex items-center justify-center space-x-1.5 text-xs font-bold py-2.5 px-3 rounded-xl transition-all cursor-pointer ${
                        driver.active === 1 && canReconcile
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20'
                          : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      <span>Iniciar Conciliação</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
