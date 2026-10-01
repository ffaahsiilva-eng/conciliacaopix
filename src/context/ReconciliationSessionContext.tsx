import React, { createContext, useContext, useState } from 'react';
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

  const toggleTransaction = (tx: Transaction) => {
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

    setSelectedTxIds((prev) => {
      const exists = prev.includes(tx.id);
      if (exists) {
        const next = prev.filter((id) => id !== tx.id);
        const mapCopy = { ...selectedTransactionsMap };
        delete mapCopy[tx.id];
        setSelectedTransactionsMap(mapCopy);
        return next;
      } else {
        setSelectedTransactionsMap((prevMap) => ({ ...prevMap, [tx.id]: tx }));
        return [...prev, tx.id];
      }
    });
  };

  const selectMultiple = (txs: Transaction[]) => {
    // Only valid pending transactions can be selected
    const allowed = txs.filter(
      (t) => t.status === 'PENDING' && t.is_pix_return !== 1 && t.is_pix_return !== true
    );
    const newIds = allowed.map((t) => t.id);
    const newMap: Record<string, Transaction> = {};
    allowed.forEach((t) => {
      newMap[t.id] = t;
    });

    setSelectedTxIds((prev) => {
      const combined = Array.from(new Set([...prev, ...newIds]));
      return combined;
    });
    setSelectedTransactionsMap((prev) => ({ ...prev, ...newMap }));
  };

  const clearSelection = () => {
    setSelectedTxIds([]);
    setSelectedTransactionsMap({});
  };

  const setVoucherForTx = (txId: string, voucher: string) => {
    setVoucherNumbers((prev) => ({ ...prev, [txId]: voucher }));
  };

  const cancelSession = () => {
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
        isSubmitting
      }}
    >
      {children}
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
