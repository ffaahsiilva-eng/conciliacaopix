import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import {
  ShieldCheck,
  CheckCircle2,
  Truck,
  FileSpreadsheet,
  UploadCloud,
  BarChart3,
  Users,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Radio,
  UserCheck,
  Building2,
  Store,
  ArrowLeftRight
} from 'lucide-react';
import { formatPlate } from '../services/api';

interface SidebarProps {
  currentTab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users';
  setCurrentTab: (tab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users') => void;
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
  onOpenUpload: () => void;
  onOpenStartSession: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  isCollapsed,
  setIsCollapsed,
  onOpenUpload,
  onOpenStartSession
}) => {
  const { currentUser } = useAuth();
  const { currentCompany, setCurrentCompany, canSwitchCompany } = useCompany();
  const { isSessionActive, activeDriver, selectedTxIds } = useReconciliationSession();

  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';

  const menuItems = [
    {
      id: 'conciliation' as const,
      label: 'Conciliação Bancária',
      shortLabel: 'Conciliação',
      icon: CheckCircle2,
      description: 'Extratos & conferência Pix'
    },
    {
      id: 'drivers' as const,
      label: 'Cadastro de Motoristas',
      shortLabel: 'Motoristas',
      icon: Truck,
      description: 'Frota, rotas e placas'
    },
    {
      id: 'sessions' as const,
      label: 'Acertos Finalizados',
      shortLabel: 'Acertos',
      icon: FileSpreadsheet,
      description: 'Histórico & comprovantes'
    },
    {
      id: 'batches' as const,
      label: 'Extratos Importados',
      shortLabel: 'Extratos',
      icon: UploadCloud,
      description: 'Lotes OFX e CSV'
    },
    {
      id: 'reports' as const,
      label: 'Relatórios & Auditoria',
      shortLabel: 'Relatórios',
      icon: BarChart3,
      description: 'Totais e conformidade'
    },
    {
      id: 'users' as const,
      label: 'Controle de Usuários',
      shortLabel: 'Usuários',
      icon: Users,
      description: 'Níveis de permissão'
    }
  ];

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 z-30 sticky top-0 h-screen shadow-sm ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 border-b border-slate-200 flex items-center justify-between px-4">
        {!isCollapsed ? (
          <div
            className="flex items-center space-x-2.5 cursor-pointer overflow-hidden"
            onClick={() => setCurrentTab('conciliation')}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  ConciliaPix
                </span>
                <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.2 rounded font-bold">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">Matriz & Filial • Multi-empresa</p>
            </div>
          </div>
        ) : (
          <div
            className="w-10 h-10 mx-auto rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 cursor-pointer"
            onClick={() => setIsCollapsed(false)}
            title="Expandir barra lateral"
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
        )}

        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors hidden sm:flex items-center justify-center"
          title={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Active Unit / Company Widget */}
      {!isCollapsed ? (
        <div className="px-3 pt-3">
          <div
            className={`p-2.5 rounded-xl border transition-all ${
              isMatriz
                ? 'bg-blue-50/80 border-blue-200/90 text-blue-950'
                : 'bg-emerald-50/80 border-emerald-200/90 text-emerald-950'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                {isMatriz ? <Building2 className="w-3 h-3 text-blue-600" /> : <Store className="w-3 h-3 text-emerald-600" />}
                <span>Unidade Ativa</span>
              </span>
              <span
                className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${
                  isMatriz ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                }`}
              >
                {currentCompany.code}
              </span>
            </div>
            <p className="text-xs font-bold truncate leading-tight">{currentCompany.name}</p>

            {canSwitchCompany && (
              <button
                onClick={() => setCurrentCompany(isMatriz ? 'filial' : 'matriz')}
                className={`mt-2 w-full flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer shadow-2xs ${
                  isMatriz
                    ? 'bg-white hover:bg-blue-100/80 text-blue-700 border-blue-200'
                    : 'bg-white hover:bg-emerald-100/80 text-emerald-700 border-emerald-200'
                }`}
                title={isMatriz ? 'Alternar para a Filial' : 'Alternar para a Matriz'}
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Alternar p/ {isMatriz ? 'Filial' : 'Matriz'}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => canSwitchCompany && setCurrentCompany(isMatriz ? 'filial' : 'matriz')}
          className={`m-2 p-2 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
            isMatriz ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          }`}
          title={`Unidade Atual: ${currentCompany.name}${canSwitchCompany ? ' (Clique para alternar)' : ''}`}
        >
          {isMatriz ? <Building2 className="w-5 h-5" /> : <Store className="w-5 h-5" />}
        </div>
      )}

      {/* Active Driver Session Alert in Sidebar */}
      {isSessionActive && activeDriver && (
        <div
          onClick={() => setCurrentTab('conciliation')}
          className={`m-3 p-2.5 bg-amber-50 border border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/80 transition-all ${
            isCollapsed ? 'text-center' : ''
          }`}
          title={`Sessão Ativa: ${activeDriver.name} (${activeDriver.vehicle_plate})`}
        >
          <div className="flex items-center space-x-2">
            <Truck className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
            {!isCollapsed && (
              <div className="overflow-hidden">
                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                  Sessão em Andamento
                </p>
                <p className="text-xs font-semibold text-slate-900 truncate">{activeDriver.name}</p>
                <p className="text-[11px] text-amber-700 font-mono">
                  {selectedTxIds.length} selecionados
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation Menu */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all group ${
                isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5 space-x-3'
              } ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon
                className={`w-5 h-5 shrink-0 transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />

              {!isCollapsed && (
                <div className="text-left truncate">
                  <div className="leading-tight">{item.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Action Buttons in Sidebar */}
      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-3">
          <button
            onClick={onOpenStartSession}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl text-xs shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            <span>Nova Conciliação</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl text-xs border border-slate-200 transition-all cursor-pointer"
          >
            <UploadCloud className="w-4 h-4 text-blue-600" />
            <span>Importar Extrato</span>
          </button>
        </div>
      )}

      {/* Bottom User Profile */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/60">
        <div
          onClick={() => setCurrentTab('users')}
          className={`flex items-center rounded-xl p-2 cursor-pointer hover:bg-white transition-all ${
            isCollapsed ? 'justify-center' : 'space-x-3'
          }`}
          title={`Usuário: ${currentUser?.name} (${currentUser?.role})`}
        >
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
            {currentUser?.name?.charAt(0) || 'U'}
          </div>

          {!isCollapsed && (
            <div className="truncate">
              <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                {currentUser?.name}
              </p>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="text-[10px] text-blue-700 font-semibold bg-blue-100 px-1.5 py-0.2 rounded">
                  {currentUser?.role === 'ADMIN'
                    ? 'Admin'
                    : currentUser?.role === 'OPERATOR'
                    ? 'Operador'
                    : 'Auditor'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
