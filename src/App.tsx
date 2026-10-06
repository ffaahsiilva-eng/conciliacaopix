import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CompanyProvider, useCompany } from './context/CompanyContext';
import { ReconciliationSessionProvider, useReconciliationSession } from './context/ReconciliationSessionContext';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DriverSessionBar } from './components/DriverSessionBar';
import { UploadModal } from './components/UploadModal';
import { StartSessionModal } from './components/StartSessionModal';
import { FinishSessionModal } from './components/FinishSessionModal';
import { DriverModal } from './components/DriverModal';
import { ReopenModal } from './components/ReopenModal';
import { ReconciliationView } from './views/ReconciliationView';
import { DriversView } from './views/DriversView';
import { SessionsView } from './views/SessionsView';
import { BatchesView } from './views/BatchesView';
import { ReportsView } from './views/ReportsView';
import { LogsView } from './views/LogsView';
import { UsersView } from './views/UsersView';
import { BackupView } from './views/BackupView';
import { BankAccount, Driver, Transaction } from './types';
import { api, formatCurrency, subscribeToRealtimeEvents } from './services/api';
import { CheckCircle2, Truck, X, Activity } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';
import { LiveConciliationPanel } from './components/LiveConciliationPanel';

function AppContent() {
  const { currentUser, loading: authLoading } = useAuth();
  const { currentCompany } = useCompany();
  const [currentTab, setCurrentTab] = useState<'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users' | 'backup' | 'logs'>('conciliation');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  
  // Modals state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [startSessionModalOpen, setStartSessionModalOpen] = useState(false);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const [driverModalOpen, setDriverModalOpen] = useState(false);
  const [driverToEdit, setDriverToEdit] = useState<Driver | null>(null);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [txToReopen, setTxToReopen] = useState<Transaction | null>(null);

  // Success reconciliation banner
  const [completedNotification, setCompletedNotification] = useState<{
    driverName: string;
    itemCount: number;
    totalAmount: number;
    missingAmount?: number;
  } | null>(null);

  const refreshDrivers = async () => {
    try {
      const driversData = await api.getDrivers();
      setDrivers(driversData);
    } catch (err) {
      console.error('Failed to reload drivers:', err);
    }
  };

  const fetchAuxData = async () => {
    // Fetch banks and drivers independently so one failure doesn't block the other
    api.getBanks().then(setBanks).catch((err) => console.error('Failed to load banks:', err));
    await refreshDrivers();
  };

  useEffect(() => {
    if (currentUser) {
      fetchAuxData();
      // Cleanup any orphaned locks from this user (e.g. previous session/browser crash)
      api.unlockAllByUser(currentUser).catch(console.error);
    }
  }, [currentCompany?.id, currentUser?.id]);
  // Global popup toasts
  const [globalToasts, setGlobalToasts] = useState<{id: number; message: string; type: 'info'|'success'}[]>([]);

  const addToast = (message: string, type: 'info'|'success' = 'info') => {
    const id = Date.now();
    setGlobalToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setGlobalToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  useEffect(() => {
    // Listen to real-time driver updates, reconciliation completion, and database cleans/restores
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (
        event.type === 'DRIVERS_UPDATED' ||
        event.type === 'RECONCILIATION_COMPLETED' ||
        event.type === 'DATABASE_CLEANED' ||
        event.type === 'DATABASE_RESTORED'
      ) {
        api.getDrivers().then(setDrivers).catch(console.error);
      }

      if (event.type === 'TRANSACTIONS_LOCKED') {
        if (event.payload?.action === 'DETAILS' || event.payload?.action === 'EDIT') {
          const driverName = event.payload?.driverName;
          addToast(`Usuário ${event.payload?.lockedByUserName} está editando um PIX${driverName ? ` do motorista ${driverName}` : ''}.`, 'info');
        }
      } else if (event.type === 'RECONCILIATION_COMPLETED') {
        addToast(`Usuário ${event.payload?.operatorName} salvou uma conciliação do motorista ${event.payload?.driverName}.`, 'success');
      } else if (event.type === 'RECONCILIATION_SESSION_STARTED') {
        const session = event.payload?.session;
        if (session?.operator_user_id !== currentUser?.id) {
          addToast(`${session?.operator_user_name} abriu uma conciliação para o motorista ${session?.driver_name}.`, 'info');
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleStartSessionForDriver = (driver: Driver) => {
    setStartSessionModalOpen(true);
  };

  const handleEditDriver = (driver: Driver) => {
    setDriverToEdit(driver);
    setDriverModalOpen(true);
  };

  const handleOpenNewDriver = () => {
    setDriverToEdit(null);
    setDriverModalOpen(true);
  };

  const handleOpenReopen = (tx: Transaction) => {
    setTxToReopen(tx);
    setReopenModalOpen(true);
  };

  const handleFinishSuccess = (data: { driverName: string; itemCount: number; totalAmount: number; missingAmount?: number }) => {
    setCompletedNotification({
      driverName: data.driverName,
      itemCount: data.itemCount,
      totalAmount: data.totalAmount,
      missingAmount: data.missingAmount
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen />;
  }

  return (
    <div className="fluent-layout">
      {/* Lateral Collapsible Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        onOpenUpload={() => setUploadModalOpen(true)}
        onOpenStartSession={() => setStartSessionModalOpen(true)}
      />

      {/* Main Content Column */}
      <div className="fluent-main-content">
        {/* Top Header */}
        <TopHeader
          currentTab={currentTab}
          onOpenUpload={() => setUploadModalOpen(true)}
          onOpenStartSession={() => setStartSessionModalOpen(true)}
          toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />

        {/* Sticky Driver Session Bar */}
        <DriverSessionBar onOpenFinishModal={() => setFinishModalOpen(true)} />

        {/* Reconciliation Completion Banner */}
        {completedNotification && (
          <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 shadow-sm animate-fade-in border-b border-emerald-500">
            <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white rounded-xl text-emerald-700 shadow-xs">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>Conciliação Concluída com Sucesso!</span>
                    <span className="text-[10px] bg-emerald-800 text-white font-bold px-2 py-0.5 rounded-full">
                      Travado no Banco de Dados
                    </span>
                  </h4>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    <strong>{completedNotification.itemCount} Pix conferidos</strong> totalizando{' '}
                    <strong className="text-white">
                      {formatCurrency(completedNotification.totalAmount)}
                    </strong>{' '}
                    para o motorista <strong>{completedNotification.driverName}</strong>.
                    {completedNotification.missingAmount && completedNotification.missingAmount > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-1 bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded-full text-[11px] shadow-xs">
                        ⚠️ Falta na prestação: {formatCurrency(completedNotification.missingAmount)}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setCompletedNotification(null);
                    setStartSessionModalOpen(true);
                  }}
                  className="bg-white hover:bg-emerald-50 text-emerald-800 font-extrabold px-3 py-1.5 rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
                >
                  Conciliar Próximo Motorista
                </button>
                <button
                  onClick={() => setCompletedNotification(null)}
                  className="text-emerald-200 hover:text-white p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main View Area */}
        <main className="flex-1 overflow-y-auto min-h-0 w-full relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
          {currentTab === 'conciliation' && (
            <ReconciliationView
              banks={banks}
              drivers={drivers}
              onOpenStartSession={() => setStartSessionModalOpen(true)}
              onOpenUpload={() => setUploadModalOpen(true)}
              onOpenReopenModal={handleOpenReopen}
            />
          )}

          {currentTab === 'drivers' && (
            <DriversView
              drivers={drivers}
              onOpenNewDriver={handleOpenNewDriver}
              onEditDriver={handleEditDriver}
              onStartSessionForDriver={handleStartSessionForDriver}
            />
          )}

          {currentTab === 'sessions' && <SessionsView />}

          {currentTab === 'batches' && (
            <BatchesView onOpenUpload={() => setUploadModalOpen(true)} />
          )}

          {currentTab === 'reports' && <ReportsView />}
          
          {currentTab === 'logs' && <LogsView />}

          {currentTab === 'backup' && (
            <BackupView onNavigateToConciliation={() => setCurrentTab('conciliation')} />
          )}

          {currentTab === 'users' && <UsersView />}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="font-semibold text-slate-600">
              ConciliaPix • Sistema de Conciliação Bancária & Motoristas
            </p>
            <p className="text-[11px] text-slate-400">
              Banco de Dados com Travas de Segurança • Sincronização em Nuvem em Tempo Real
            </p>
          </div>
        </footer>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={() => {
          fetchAuxData();
        }}
        banks={banks}
      />

      <StartSessionModal
        isOpen={startSessionModalOpen}
        onClose={() => setStartSessionModalOpen(false)}
        drivers={drivers}
        onOpenNewDriver={() => {
          setStartSessionModalOpen(false);
          handleOpenNewDriver();
        }}
      />

      <FinishSessionModal
        isOpen={finishModalOpen}
        onClose={() => setFinishModalOpen(false)}
        onSuccess={handleFinishSuccess}
      />

      <DriverModal
        isOpen={driverModalOpen}
        onClose={() => setDriverModalOpen(false)}
        driverToEdit={driverToEdit}
        onSuccess={refreshDrivers}
      />

      <ReopenModal
        isOpen={reopenModalOpen}
        onClose={() => {
          setReopenModalOpen(false);
          setTxToReopen(null);
        }}
        transaction={txToReopen}
        onSuccess={fetchAuxData}
      />

      {/* Global Toasts (Bottom Right) */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {globalToasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto px-4 py-3 rounded-xl shadow-xl border animate-fade-in flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Activity className="w-5 h-5 text-blue-600 animate-pulse" />}
            <span className="font-semibold text-sm max-w-xs">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Painel persistente de conciliação em tempo real (aviso detalhado) */}
      <LiveConciliationPanel currentUserId={currentUser?.id} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CompanyProvider>
        <ReconciliationSessionProvider>
          <AppContent />
        </ReconciliationSessionProvider>
      </CompanyProvider>
    </AuthProvider>
  );
}
