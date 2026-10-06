import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import {
  UploadCloud,
  Truck,
  ChevronDown,
  UserCheck,
  Menu,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Key,
  Users,
  LogOut,
  Building2,
  Store,
  ArrowLeftRight,
  Check,
  Database
} from 'lucide-react';
import { ChangePasswordModal } from './ChangePasswordModal';
import { SwitchUserModal } from './SwitchUserModal';
import { BackupModal } from './BackupModal';

interface TopHeaderProps {
  currentTab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users' | 'backup' | 'logs';
  onOpenUpload: () => void;
  onOpenStartSession: () => void;
  toggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentTab,
  onOpenUpload,
  onOpenStartSession,
  toggleSidebar
}) => {
  const { currentUser, logout, canImport, canReconcile } = useAuth();
  const { currentCompany, setCurrentCompany, availableCompanies, canSwitchCompany } = useCompany();
  const { isSessionActive } = useReconciliationSession();
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [switchUserModalOpen, setSwitchUserModalOpen] = useState(false);
  const [backupModalOpen, setBackupModalOpen] = useState(false);

  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';

  const getTabTitle = () => {
    switch (currentTab) {
      case 'conciliation':
        return {
          title: 'Conciliação Bancária de Extratos',
          subtitle: `Conferência de recebimentos Pix na ${currentCompany.name}`
        };
      case 'drivers':
        return {
          title: 'Cadastro de Motoristas da Empresa',
          subtitle: `Frota e motoristas vinculados à ${currentCompany.name}`
        };
      case 'sessions':
        return {
          title: 'Histórico de Acertos Concluídos',
          subtitle: `Consultas e comprovantes da ${currentCompany.name}`
        };
      case 'batches':
        return {
          title: 'Extratos Bancários Importados',
          subtitle: `Arquivos OFX e CSV importados na ${currentCompany.name}`
        };
      case 'reports':
        return {
          title: 'Relatórios Gerenciais',
          subtitle: `Totalizadores de acertos e bancos da ${currentCompany.name}`
        };
      case 'logs':
        return {
          title: 'Trilha de Auditoria & Logs',
          subtitle: `Atividades sensíveis de usuários na ${currentCompany.name}`
        };
      case 'backup':
        return {
          title: 'Backup & Restauração de Dados',
          subtitle: 'Segurança diária, exportação de arquivos e recuperação na nuvem'
        };
      case 'users':
        return {
          title: 'Controle de Usuários e Permissões',
          subtitle: 'Acessos por empresa (Matriz / Filial), operadores e auditores'
        };
    }
  };

  const { title, subtitle } = getTabTitle();

  return (
    <>
      <header className="fluent-topbar">
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleSidebar} 
            className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 p-2 rounded-lg cursor-pointer transition-colors"
            title="Mostrar/Esconder Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="fluent-page-title">
            <h1>
              {title}
              <span className={isMatriz ? 'fluent-badge-matriz' : 'fluent-badge-filial'}>
                {currentCompany.name}
              </span>
            </h1>
            <p>{subtitle}</p>
          </div>
        </div>

        <div className="fluent-header-actions">
          {canSwitchCompany && (
            <button
              onClick={() => setCurrentCompany(isMatriz ? 'filial' : 'matriz')}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl py-2 px-4 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all font-semibold"
            >
              {isMatriz ? '🏢 Matriz' : '🏪 Filial'}
            </button>
          )}

          <span className="fluent-status-badge">Conectado</span>

          {canImport && (
            <button onClick={onOpenUpload} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl py-2 px-4 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all font-semibold">
              ☁️ Importar Extrato
            </button>
          )}

          {canReconcile && !isSessionActive && (
            <button onClick={onOpenStartSession} className="border-2 border-blue-700 text-blue-800 bg-white hover:bg-blue-50 font-bold rounded-xl py-2 px-4 flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all">
              Nova Conciliação
            </button>
          )}

          {/* Active User Dropdown Switcher */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl cursor-pointer shadow-sm transition-all"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                {currentUser?.name?.charAt(0) || 'U'}
              </div>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {userDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 text-slate-700 animate-fade-in" style={{zIndex: 50}}>
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Sessão Autenticada
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{currentUser?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
                </div>

                <div className="p-2 space-y-1">
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setBackupModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center space-x-2.5 hover:bg-blue-50 text-blue-900 font-bold transition-colors cursor-pointer"
                  >
                    <Database className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Backup & Nuvem (Cloud SQL)</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setChangePasswordModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center space-x-2.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                  >
                    <Key className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Alterar Minha Senha</span>
                  </button>

                  <button
                    onClick={() => {
                      setUserDropdownOpen(false);
                      setSwitchUserModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center space-x-2.5 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Trocar de Usuário (requer senha)</span>
                  </button>

                  <div className="pt-1 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center space-x-2.5 hover:bg-red-50 text-red-700 font-bold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Sair / Bloquear Sistema</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      {/* Modals for password and backup actions */}
      <BackupModal
        isOpen={backupModalOpen}
        onClose={() => setBackupModalOpen(false)}
      />

      <ChangePasswordModal
        isOpen={changePasswordModalOpen}
        onClose={() => setChangePasswordModalOpen(false)}
      />

      <SwitchUserModal
        isOpen={switchUserModalOpen}
        onClose={() => setSwitchUserModalOpen(false)}
      />
    </>
  );
};

