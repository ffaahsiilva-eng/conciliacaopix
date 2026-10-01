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
import { UsersView } from './views/UsersView';
import { BankAccount, Driver, Transaction } from './types';
import { api, formatCurrency, subscribeToRealtimeEvents } from './services/api';
import { CheckCircle2, Truck, X } from 'lucide-react';
import { LoginScreen } from './components/LoginScreen';

function AppContent() {
  const { currentUser, loading: authLoading } = useAuth();
  const { currentCompany } = useCompany();
  const [currentTab, setCurrentTab] = useState<'conciliation' | 'drivers' | 'sessions' | 'batches' | 'reports' | 'users'>('conciliation');
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
  } | null>(null);

  const fetchAuxData = async () => {
    try {
      const [banksData, driversData] = await Promise.all([
        api.getBanks(),
        api.getDrivers()
      ]);
      setBanks(banksData);
      setDrivers(driversData);
    } catch (err) {
      console.error('Failed to load auxiliary data:', err);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAuxData();
    }
  }, [currentCompany?.id, currentUser?.id]);

  useEffect(() => {
    // Listen to real-time driver updates
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (event.type === 'DRIVERS_UPDATED' || event.type === 'RECONCILIATION_COMPLETED') {
        api.getDrivers().then(setDrivers).catch(console.error);
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

  const handleFinishSuccess = (data: { driverName: string; itemCount: number; totalAmount: number }) => {
    setCompletedNotification({
      driverName: data.driverName,
      itemCount: data.itemCount,
      totalAmount: data.totalAmount
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
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
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
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
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
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

          {currentTab === 'users' && <UsersView />}
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
        onSuccess={fetchAuxData}
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
