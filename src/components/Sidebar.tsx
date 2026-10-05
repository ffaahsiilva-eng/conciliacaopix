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
  ArrowLeftRight,
  Database
} from 'lucide-react';
import { formatPlate } from '../services/api';

interface SidebarProps {
  currentTab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users' | 'backup';
  setCurrentTab: (tab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users' | 'backup') => void;
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
  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';

  const menuItems = [
    { id: 'conciliation' as const, label: 'Conciliação Bancária', description: 'Extratos & conferência Pix', icon: CheckCircle2 },
    { id: 'drivers' as const, label: 'Cadastro de Motoristas', description: 'Frota, rotas e placas', icon: Truck },
    { id: 'sessions' as const, label: 'Acertos Finalizados', description: 'Histórico & comprovantes', icon: FileSpreadsheet },
    { id: 'batches' as const, label: 'Extratos Importados', description: 'Lotes OFX e CSV', icon: UploadCloud },
    { id: 'reports' as const, label: 'Relatórios & Auditoria', description: 'Totais e conformidade', icon: BarChart3 },
    ...(currentUser?.role === 'ADMIN' ? [{ id: 'users' as const, label: 'Controle de Usuários', description: 'Níveis de permissão', icon: Users }] : [])
  ];

  if (isCollapsed) return null; // In this Fluent Design we keep it simple for now, or just don't collapse.

  return (
    <aside className="fluent-sidebar">
      <div className="fluent-brand" style={{ gap: '2px', marginLeft: '-4px' }}>
        <div className="fluent-brand-icon" style={{ background: 'transparent', width: '48px', height: '48px', padding: 0 }}>
          <img src="/caminhaoagua.png" alt="Logo" className="w-full h-full object-contain" />
        </div>
        <div className="fluent-brand-name">
          ConciliaPix <span style={{color: 'var(--accent-blue)', fontWeight: 600}}>PRO</span>
          <span>Matriz & Filial • Multi-empr...</span>
        </div>
      </div>

      <div className="fluent-unit-selector">
        UNIDADE ATIVA <span style={{float: 'right', background: 'var(--accent-blue)', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '9px'}}>{isMatriz ? 'MATRIZ' : 'FILIAL'}</span>
        <div style={{marginTop: '4px', color: 'var(--text-main)', fontSize: '14px'}}>
          {currentCompany.name}
        </div>
        {canSwitchCompany && (
          <button 
            className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold rounded-lg shadow-sm transition-all" 
            style={{width: '100%', marginTop: '8px', fontSize: '11px', padding: '6px', cursor: 'pointer'}}
            onClick={() => setCurrentCompany(isMatriz ? 'filial' : 'matriz')}
          >
            ⇄ Alternar p/ {isMatriz ? 'Filial' : 'Matriz'}
          </button>
        )}
      </div>

      <nav className="fluent-nav-menu">
        {menuItems.map((item) => {
          const isActive = currentTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`fluent-nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <div>
                {item.label}
                <span>{item.description}</span>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="fluent-sidebar-actions">
        <button 
          onClick={onOpenStartSession} 
          className="border-2 border-blue-700 text-blue-800 bg-white hover:bg-blue-50 font-bold rounded-lg py-1.5 px-3 text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all" 
          style={{width: '100%'}}
        >
          <Truck className="w-4 h-4" /> Nova Conciliação
        </button>
        <button onClick={onOpenUpload} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg py-1.5 px-3 text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all font-semibold" style={{width: '100%'}}>
          <UploadCloud className="w-4 h-4" /> Importar Extrato
        </button>
      </div>

      <div className="fluent-user-profile">
        <div className="fluent-user-avatar">{currentUser?.name?.charAt(0) || 'U'}</div>
        <div className="fluent-user-info">
          {currentUser?.name}
          <span>{currentUser?.role}</span>
        </div>
      </div>
    </aside>
  );
};
