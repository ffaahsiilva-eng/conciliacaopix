import React, { createContext, useContext, useState, useEffect } from 'react';
import { Driver, Transaction } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

interface ReconciliationSessionContextType {
  activeDriver: Driver | null;
  activeSessionId: string | null;
  selectedTxIds: string[];
  voucherNumbers: Record<string, string>;
  generalVoucher: string;
  sessionNotes: string;
  missingAmount: number;
  isSessionActive: boolean;
  selectedTransactions: Transaction[];
  totalSelectedAmount: number;
  startSession: (driver: Driver, notes?: string) => Promise<void>;
  toggleTransaction: (tx: Transaction) => void;
  selectMultiple: (txs: Transaction[]) => void;
  clearSelection: () => void;
  setVoucherForTx: (txId: string, voucher: string) => void;
  setGeneralVoucher: (val: string) => void;
  setSessionNotes: (val: string) => void;
  setMissingAmount: (val: number) => void;
  finishSession: () => Promise<{
    sessionId: string;
    driverName: string;
    itemCount: number;
    totalAmount: number;
    missingAmount?: number;
  }>;
  cancelSession: () => void;
  isSubmitting: boolean;
  showBlockMessage: (msg: string) => void;
}

const ReconciliationSessionContext = createContext<ReconciliationSessionContextType | undefined>(undefined);

export const ReconciliationSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [activeDriver, setActiveDriver] = useState<Driver | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [selectedTransactionsMap, setSelectedTransactionsMap] = useState<Record<string, Transaction>>({});
  const [voucherNumbers, setVoucherNumbers] = useState<Record<string, string>>({});
  const [generalVoucher, setGeneralVoucher] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState<string>('');
  const [missingAmount, setMissingAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);

  const startSession = async (driver: Driver, notes?: string) => {
    if (!currentUser) throw new Error('Usuário não autenticado.');
    try {
      setIsSubmitting(true);
      const res = await api.startReconciliationSession(driver.id, notes, currentUser);
      setActiveDriver(driver);
      setActiveSessionId(res.id);
      setSelectedTxIds([]);
      setSelectedTransactionsMap({});
      setVoucherNumbers({});
      setGeneralVoucher('');
      setSessionNotes(notes || '');
      setMissingAmount(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fallback: unlock on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedTxIds.length > 0 && currentUser) {
        // We use navigator.sendBeacon or a synchronous fetch if possible, 
        // but since we can't await here reliably, just firing a fire-and-forget fetch
        const companyId = api.getGlobalCompanyId();
        fetch('/api/transactions/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-company-id': companyId },
          body: JSON.stringify({ transaction_ids: selectedTxIds, actorUser: currentUser }),
          keepalive: true
        }).catch(() => {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedTxIds, currentUser]);

  const toggleTransaction = async (tx: Transaction) => {
    // Crucial rule: Reconciled, returned Pix, or ignored transactions can NEVER be selected
    if (
      tx.status === 'RECONCILED' ||
      tx.status === 'RETURNED' ||
      tx.status === 'IGNORED' ||
      tx.is_pix_return === 1 ||
      tx.is_pix_return === true
    ) {
      return;
    }

    const isSelecting = !selectedTxIds.includes(tx.id);

    if (isSelecting) {
      if (!currentUser) return;
      try {
        await api.lockTransactions([tx.id], activeSessionId, currentUser);
        setSelectedTxIds((prev) => [...prev, tx.id]);
        setSelectedTransactionsMap((prevMap) => ({ ...prevMap, [tx.id]: tx }));
      } catch (err: any) {
        showBlockMessage(err.message || 'Não foi possível bloquear a transação.');
      }
    } else {
      if (currentUser) {
        // unlock
        api.unlockTransactions([tx.id], currentUser).catch(console.error);
      }
      setSelectedTxIds((prev) => prev.filter((id) => id !== tx.id));
      setSelectedTransactionsMap((prevMap) => {
        const mapCopy = { ...prevMap };
        delete mapCopy[tx.id];
        return mapCopy;
      });
    }
  };

  const selectMultiple = async (txs: Transaction[]) => {
    // Only valid pending transactions can be selected
    const allowed = txs.filter(
      (t) => t.status === 'PENDING' && t.is_pix_return !== 1 && t.is_pix_return !== true && !selectedTxIds.includes(t.id)
    );
    if (allowed.length === 0) return;
    
    if (!currentUser) return;
    const newIds = allowed.map((t) => t.id);

    try {
      await api.lockTransactions(newIds, activeSessionId, currentUser);
      
      const newMap: Record<string, Transaction> = {};
      allowed.forEach((t) => {
        newMap[t.id] = t;
      });

      setSelectedTxIds((prev) => {
        const combined = Array.from(new Set([...prev, ...newIds]));
        return combined;
      });
      setSelectedTransactionsMap((prev) => ({ ...prev, ...newMap }));
    } catch (err: any) {
      showBlockMessage(err.message || 'Erro ao tentar bloquear as transações.');
    }
  };

  const clearSelection = () => {
    if (selectedTxIds.length > 0 && currentUser) {
      api.unlockTransactions(selectedTxIds, currentUser).catch(console.error);
    }
    setSelectedTxIds([]);
    setSelectedTransactionsMap({});
  };

  const setVoucherForTx = (txId: string, voucher: string) => {
    setVoucherNumbers((prev) => ({ ...prev, [txId]: voucher }));
  };

  const cancelSession = () => {
    if (selectedTxIds.length > 0 && currentUser) {
      api.unlockTransactions(selectedTxIds, currentUser).catch(console.error);
    }
    setActiveDriver(null);
    setActiveSessionId(null);
    setSelectedTxIds([]);
    setSelectedTransactionsMap({});
    setVoucherNumbers({});
    setGeneralVoucher('');
    setSessionNotes('');
    setMissingAmount(0);
  };

  const finishSession = async () => {
    if (!activeDriver) throw new Error('Nenhum motorista ativo na sessão.');
    if (!currentUser) throw new Error('Usuário não autenticado.');

    try {
      setIsSubmitting(true);
      const res = await api.finishReconciliationSession({
        session_id: activeSessionId || undefined,
        driver_id: activeDriver.id,
        transaction_ids: selectedTxIds,
        voucher_numbers: voucherNumbers,
        general_voucher: generalVoucher,
        missing_amount: missingAmount,
        notes: sessionNotes,
        actorUser: currentUser
      });

      // Clear session so operator can start next driver reconciliation
      cancelSession();
      return res;
    } finally {
      setIsSubmitting(false);
    }
  };

    const selectedTransactions = Object.values(selectedTransactionsMap);
  const totalSelectedAmount = selectedTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);

  const showBlockMessage = (msg: string) => {
    setBlockingMessage(msg);
  };

  return (
    <ReconciliationSessionContext.Provider
      value={{
        activeDriver,
        activeSessionId,
        selectedTxIds,
        voucherNumbers,
        generalVoucher,
        sessionNotes,
        missingAmount,
        isSessionActive: !!activeDriver,
        selectedTransactions,
        totalSelectedAmount,
        startSession,
        toggleTransaction,
        selectMultiple,
        clearSelection,
        setVoucherForTx,
        setGeneralVoucher,
        setSessionNotes,
        setMissingAmount,
        finishSession,
        cancelSession,
        isSubmitting,
        showBlockMessage
      }}
    >
      {children}
      {blockingMessage && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-fade-in-up">
            <div className="mx-auto w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Comprovante em Uso</h3>
            <p className="text-slate-600 mb-6">{blockingMessage}</p>
            <button
              onClick={() => setBlockingMessage(null)}
              className="w-full py-2.5 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </ReconciliationSessionContext.Provider>
  );
};

export const useReconciliationSession = () => {
  const context = useContext(ReconciliationSessionContext);
  if (!context) {
    throw new Error('useReconciliationSession must be used within a ReconciliationSessionProvider');
  }
  return context;
};
