import React, { createContext, useContext, useState, useEffect } from 'react';
import { Driver, Transaction } from '../types';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { BlockDetailedModal } from '../components/LiveConciliationPanel';

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
  startSession: (driver: Driver, notes?: string) => Promise<boolean>;
  toggleTransaction: (tx: Transaction) => Promise<void>;
  selectMultiple: (txs: Transaction[]) => Promise<void>;
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
  showDetailedBlock: (info: {
    blockedByUserName: string;
    description?: string;
    amount?: number;
    lockedAt?: string;
    transactionId?: string;
    entityKind?: 'transaction' | 'driver';
    entityLabel?: string;
  }) => void;
  adminUnlockLoading: boolean;
  handleAdminForceUnlock: () => Promise<void>;
  handleAdminForceTakeOver: () => Promise<void>;
}

const ReconciliationSessionContext = createContext<ReconciliationSessionContextType | undefined>(undefined);

export const ReconciliationSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isAdmin: isUserAdmin } = useAuth();
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
  const [detailedBlock, setDetailedBlock] = useState<{
    blockedByUserName: string;
    description?: string;
    amount?: number;
    lockedAt?: string;
    transactionId?: string;
    entityKind?: 'transaction' | 'driver';
    entityLabel?: string;
  } | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const startSession = async (driver: Driver, notes?: string): Promise<boolean> => {
    if (!currentUser) throw new Error('Usuário não autenticado.');
    
    if (selectedTxIds.length > 0) {
      api.unlockTransactions(selectedTxIds, currentUser).catch(console.error);
    }

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
      return true;
    } catch (err: any) {
      // 409 estruturado vindo do servidor (motorista já em conciliação por
      // outro operador) → propaga para a UI abrir o modal vermelho.
      if (err?.code === 409 && err?.lockedByUserName) {
        setDetailedBlock({
          blockedByUserName: err.lockedByUserName,
          description: err.driverName,
          amount: undefined,
          lockedAt: err.startedAt,
          transactionId: undefined,
          entityKind: 'driver',
          entityLabel: 'Motorista'
        });
        return false;
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fallback: unlock on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser) {
        // Use sendBeacon for reliability - unlocks ALL locks held by this user
        const companyId = api.getGlobalCompanyId();
        const payload = JSON.stringify({ actorUser: currentUser, company_id: companyId });
        navigator.sendBeacon('/api/transactions/unlock-all-by-user', new Blob([payload], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser]);

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
        await api.lockTransactions(
          [tx.id],
          activeSessionId,
          currentUser
        );
        setSelectedTxIds((prev) => (prev.includes(tx.id) ? prev : [...prev, tx.id]));
        setSelectedTransactionsMap((prevMap) =>
          prevMap[tx.id] ? prevMap : { ...prevMap, [tx.id]: tx }
        );
      } catch (err: any) {
        // Operador (ou admin sem force) caiu em 409 → mostra modal vermelho
        // com nome/descrição/valor do bloqueador. Admin tem botões extras.
        showDetailedBlockFromError(err, tx);
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

    // Otimista: aplica localmente primeiro; em caso de 409 reverte.
    const newMap: Record<string, Transaction> = {};
    allowed.forEach((t) => {
      newMap[t.id] = t;
    });
    setSelectedTxIds((prev) => Array.from(new Set([...prev, ...newIds])));
    setSelectedTransactionsMap((prev) => ({ ...prev, ...newMap }));

    try {
      await api.lockTransactions(newIds, activeSessionId, currentUser);
    } catch (err: any) {
      // Reverte tudo o que otimisticamente aplicamos.
      setSelectedTxIds((prev) => prev.filter((id) => !newIds.includes(id)));
      setSelectedTransactionsMap((prev) => {
        const mapCopy = { ...prev };
        for (const id of newIds) delete mapCopy[id];
        return mapCopy;
      });
      showDetailedBlockFromError(err, allowed[0]);
    }
  };

  /**
   * Constrói o payload para o BlockDetailedModal a partir do erro estruturado
   * do servidor (que agora traz nome/descrição/valor do bloqueador) ou
   * cai de volta para extração via regex.
   */
  const showDetailedBlockFromError = (err: any, tx: Transaction) => {
    if (err?.lockedByUserName) {
      showDetailedBlock({
        blockedByUserName: err.lockedByUserName,
        description: err.description ?? tx.description,
        amount: err.amount ?? tx.amount,
        lockedAt: err.lockedAt ?? tx.locked_at,
        transactionId: err.transactionId ?? tx.id
      });
    } else {
      const detail = extractBlockDetail(err, tx);
      if (detail) {
        showDetailedBlock({
          blockedByUserName: detail.userName,
          description: tx.description,
          amount: tx.amount,
          lockedAt: detail.lockedAt,
          transactionId: tx.id
        });
      } else {
        showBlockMessage(err.message || 'Não foi possível bloquear a transação.');
      }
    }
  };

  /**
   * Extrai o nome do usuário bloqueador a partir da mensagem de erro
   * retornada pelo servidor (que inclui o nome do operador).
   */
  const extractBlockDetail = (
    err: any,
    tx: Transaction
  ): { userName: string; lockedAt?: string } | null => {
    const raw =
      err?.message ||
      err?.error ||
      (typeof err === 'string' ? err : '');
    if (!raw || typeof raw !== 'string') return null;
    // Padrão PT-BR: "já está sendo concilada por <NOME>."
    const match = raw.match(/por\s+([^.\n]+?)\.?\s*$/i);
    if (!match) return null;
    const name = match[1].trim();
    if (!name) return null;
    return { userName: name, lockedAt: tx.locked_at };
  };

  const showDetailedBlock = (info: {
    blockedByUserName: string;
    description?: string;
    amount?: number;
    lockedAt?: string;
    transactionId?: string;
    entityKind?: 'transaction' | 'driver';
    entityLabel?: string;
  }) => {
    setDetailedBlock(info);
  };

  /**
   * Admin: libera o item bloqueado por outro usuário (não seleciona para si).
   * O outro usuário recebe o evento TRANSACTIONS_UNLOCKED em tempo real.
   */
  const handleAdminForceUnlock = async () => {
    if (!detailedBlock?.transactionId || !currentUser) return;
    try {
      setAdminLoading(true);
      await api.unlockTransactions([detailedBlock.transactionId], currentUser);
      setDetailedBlock(null);
    } catch (err: any) {
      showBlockMessage(err.message || 'Falha ao desbloquear como administrador.');
    } finally {
      setAdminLoading(false);
    }
  };

  /**
   * Admin: desbloqueia o item e já marca como bloqueado para si (force lock).
   * Equivale a tomar o lock do outro usuário (auditado).
   */
  const handleAdminForceTakeOver = async () => {
    if (!detailedBlock?.transactionId || !currentUser) return;
    try {
      setAdminLoading(true);
      await api.unlockTransactions([detailedBlock.transactionId], currentUser);
      await api.lockTransactions(
        [detailedBlock.transactionId],
        activeSessionId,
        currentUser,
        undefined,
        { force: true }
      );
      // Adiciona localmente à seleção
      const tx: Transaction = {
        id: detailedBlock.transactionId,
        description: detailedBlock.description,
        amount: detailedBlock.amount
      } as Transaction;
      setSelectedTxIds((prev) =>
        prev.includes(tx.id) ? prev : [...prev, tx.id]
      );
      setSelectedTransactionsMap((prev) => ({ ...prev, [tx.id]: tx }));
      setDetailedBlock(null);
    } catch (err: any) {
      showBlockMessage(err.message || 'Falha ao tomar o lock como administrador.');
    } finally {
      setAdminLoading(false);
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

  const clearSessionState = () => {
    setActiveDriver(null);
    setActiveSessionId(null);
    setSelectedTxIds([]);
    setSelectedTransactionsMap({});
    setVoucherNumbers({});
    setGeneralVoucher('');
    setSessionNotes('');
    setMissingAmount(0);
  };

  const cancelSession = async () => {
    if (selectedTxIds.length > 0 && currentUser) {
      api.unlockTransactions(selectedTxIds, currentUser).catch(console.error);
    }
    if (activeSessionId && currentUser) {
      api.cancelReconciliationSession(activeSessionId, currentUser).catch(console.error);
    }
    clearSessionState();
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
      clearSessionState();
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
        showBlockMessage,
        showDetailedBlock,
        adminUnlockLoading: adminLoading,
        handleAdminForceUnlock,
        handleAdminForceTakeOver
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
      <BlockDetailedModal
        open={!!detailedBlock}
        onClose={() => setDetailedBlock(null)}
        blockedByUserName={detailedBlock?.blockedByUserName || ''}
        description={detailedBlock?.description}
        amount={detailedBlock?.amount}
        lockedAt={detailedBlock?.lockedAt}
        entityKind={detailedBlock?.entityKind}
        entityLabel={detailedBlock?.entityLabel}
        isAdmin={isUserAdmin}
        adminLoading={adminLoading}
        onAdminForceUnlock={handleAdminForceUnlock}
        onAdminForceTakeOver={handleAdminForceTakeOver}
      />
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
