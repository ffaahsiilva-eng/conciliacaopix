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
  currentTab: 'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users' | 'backup';
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
          title: 'Relatórios Gerenciais & Auditoria',
          subtitle: `Totalizadores e conformidade da ${currentCompany.name}`
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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Left: Mobile hamburger & Page Title */}
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleSidebar}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg sm:hidden cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
                  {title}
                </h1>
                {/* Active Company Mini Badge */}
                <span
                  className={`hidden md:inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full border shadow-2xs ${
                    isMatriz
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {isMatriz ? <Building2 className="w-3 h-3 text-blue-600" /> : <Store className="w-3 h-3 text-emerald-600" />}
                  <span>{currentCompany.name}</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">{subtitle}</p>
            </div>
          </div>

          {/* Right: Company Switcher Key + Sync Status + Actions + User Profile */}
          <div className="flex items-center space-x-2.5">
            {/* PROMINENT COMPANY SWITCHER KEY (Matriz / Filial) */}
            {canSwitchCompany ? (
              <div className="relative">
                {/* Segmented Quick Switch Key */}
                <div className="flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200 shadow-2xs">
                  <button
                    onClick={() => setCurrentCompany('matriz')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isMatriz
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                    title="Alternar para a Matriz (Sede Principal)"
                  >
                    <Building2 className={`w-3.5 h-3.5 ${isMatriz ? 'text-white' : 'text-blue-600'}`} />
                    <span>Matriz</span>
                  </button>

                  <button
                    onClick={() => setCurrentCompany('filial')}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !isMatriz
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`}
                    title="Alternar para a Filial (Unidade 01)"
                  >
                    <Store className={`w-3.5 h-3.5 ${!isMatriz ? 'text-white' : 'text-emerald-600'}`} />
                    <span>Filial</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Locked Company Indicator when operator only has single branch permission */
              <div
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                  isMatriz
                    ? 'bg-blue-50 text-blue-800 border-blue-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
                title="Acesso exclusivo fixado nesta unidade para seu usuário"
              >
                {isMatriz ? (
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                ) : (
                  <Store className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span>{isMatriz ? 'Matriz' : 'Filial'}</span>
                <span className="text-[10px] font-normal text-slate-500 ml-1">(Exclusivo)</span>
              </div>
            )}

            {/* Cloud Sync Status Indicator with click to open Backup / Cloud SQL modal */}
            <button
              onClick={() => setBackupModalOpen(true)}
              className="hidden xl:flex items-center space-x-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors"
              title="Google Cloud SQL PostgreSQL Ativo - Clique para gerenciar backups"
            >
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-emerald-800">Cloud SQL Conectado</span>
            </button>

            {/* Quick Buttons */}
            {canImport && (
              <button
                onClick={onOpenUpload}
                className="hidden lg:inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-blue-600" />
                <span>Importar Extrato</span>
              </button>
            )}

            {canReconcile && !isSessionActive && (
              <button
                onClick={onOpenStartSession}
                className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>Nova Conciliação</span>
              </button>
            )}

            {/* Active User Dropdown Switcher */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center space-x-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-left transition-all cursor-pointer"
              >
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {currentUser?.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight max-w-[120px] truncate">
                    {currentUser?.name}
                  </div>
                  <div className="text-[10px] text-blue-700 font-semibold">{currentUser?.role}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 text-slate-700 animate-fade-in">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Sessão Autenticada
                    </p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{currentUser?.name}</p>
                    <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {currentUser?.role === 'ADMIN'
                          ? 'Administrador Geral'
                          : currentUser?.role === 'OPERATOR'
                          ? 'Operador Conciliador'
                          : 'Auditor Fiscal'}
                      </span>
                      <span className="bg-slate-100 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                        {canSwitchCompany
                          ? 'Acesso: Matriz + Filial'
                          : `Acesso: ${isMatriz ? 'Matriz' : 'Filial'}`}
                      </span>
                    </div>
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

