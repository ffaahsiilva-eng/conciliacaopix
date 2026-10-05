import React, { useState, useEffect } from 'react';
import { Transaction, BankAccount, Driver, TransactionFilters, TransactionStats } from '../types';
import { api, formatCurrency, formatDate, formatDateTime, formatPlate, subscribeToRealtimeEvents } from '../services/api';
import { LicensePlateBadge } from '../components/LicensePlateBadge';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { useReconciliationSession } from '../context/ReconciliationSessionContext';
import {
  CheckCircle2,
  Clock,
  Lock,
  Search,
  Filter,
  Truck,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Building2,
  Store,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  LockOpen,
  ChevronLeft,
  ChevronRight,
  Zap,
  Trash2,
  EyeOff,
  Eye,
  AlertTriangle,
  X,
  Undo2,
  User,
  UserX,
  FileText,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowDownWideNarrow,
  Pencil
} from 'lucide-react';
import { LinkReturnModal } from '../components/LinkReturnModal';
import { TransactionDetailsModal } from '../components/TransactionDetailsModal';
import { EditTransactionModal } from '../components/EditTransactionModal';

interface ReconciliationViewProps {
  banks: BankAccount[];
  drivers: Driver[];
  onOpenStartSession: () => void;
  onOpenUpload: () => void;
  onOpenReopenModal: (tx: Transaction) => void;
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({
  banks,
  drivers,
  onOpenStartSession,
  onOpenUpload,
  onOpenReopenModal
}) => {
  const { currentUser, canReopen, canReconcile, isAdmin } = useAuth();
  const { currentCompany } = useCompany();
  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';
  const {
    isSessionActive,
    activeSessionId,
    activeDriver,
    selectedTxIds,
    toggleTransaction,
    selectMultiple,
    showBlockMessage
  } = useReconciliationSession();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters state
  const [filters, setFilters] = useState<TransactionFilters>({
    status: 'ALL',
    bank: 'ALL',
    driver_id: 'ALL',
    is_pix: false,
    unidentified_payer: false,
    type: 'CREDIT',
    search: '',
    start_date: '',
    end_date: '',
    order_by: 'DATE_DESC',
    page: 1,
    limit: 20
  });

  const [searchInput, setSearchInput] = useState(filters.search);

  // Debounce effect for search
  useEffect(() => {
    const handler = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: searchInput, page: 1 }));
    }, 600);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Re-fetch transactions whenever current company changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: 1 }));
  }, [currentCompany?.id]);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 1
  });

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [liveNotification, setLiveNotification] = useState<string | null>(null);

  // Modals for transaction deletion, ignore, mark return or edit
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [txToIgnore, setTxToIgnore] = useState<Transaction | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('Depósito bancário na agência (não é prestação de contas)');
  const [txToReturn, setTxToReturn] = useState<Transaction | null>(null);
  const [txToEdit, setTxToEdit] = useState<Transaction | null>(null);
  const [returnType, setReturnType] = useState<'TOTAL' | 'PARTIAL'>('TOTAL');
  const [partialReturnAmount, setPartialReturnAmount] = useState<string>('');
  const [returnReason, setReturnReason] = useState('Devolução de Pix / Estorno realizado ao cliente');
  const [actionLoading, setActionLoading] = useState(false);

  // Link return modal and Details modal
  const [debitTxForLinking, setDebitTxForLinking] = useState<Transaction | null>(null);
  const [selectedTxForDetails, setSelectedTxForDetails] = useState<Transaction | null>(null);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await api.getTransactions(filters);
      setTransactions(res.transactions);
      setStats(res.stats);
      setPagination(res.pagination);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar transações do extrato.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [filters]);

  useEffect(() => {
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (
        event.type === 'RECONCILIATION_COMPLETED' ||
        event.type === 'STATEMENT_IMPORTED' ||
        event.type === 'STATEMENT_DELETED' ||
        event.type === 'TRANSACTION_REOPENED' ||
        event.type === 'TRANSACTION_DELETED' ||
        event.type === 'TRANSACTION_UPDATED' ||
        event.type === 'DATABASE_CLEANED' ||
        event.type === 'TRANSACTIONS_LOCKED' ||
        event.type === 'TRANSACTIONS_UNLOCKED'
      ) {
        if (event.type === 'RECONCILIATION_COMPLETED') {
          setLiveNotification(
            `Sincronizado: ${event.payload?.itemCount} transações conciliadas por ${event.payload?.operatorName} para o motorista ${event.payload?.driverName}!`
          );
        } else if (event.type === 'STATEMENT_IMPORTED') {
          setLiveNotification(
            `Novo extrato importado: ${event.payload?.importedCount} transações adicionadas (${event.payload?.bankName}).`
          );
        } else if (event.type === 'STATEMENT_DELETED') {
          setLiveNotification(`Extrato excluído com sucesso.`);
        } else if (event.type === 'TRANSACTION_DELETED') {
          setLiveNotification(`Lançamento excluído com sucesso.`);
        } else if (event.type === 'TRANSACTION_UPDATED') {
          setLiveNotification(`Transação atualizada em tempo real.`);
        } else if (event.type === 'DATABASE_CLEANED') {
          setLiveNotification(`Banco de dados limpo com sucesso.`);
        } else if (event.type === 'TRANSACTIONS_LOCKED' && event.payload?.lockedByUserId !== currentUser?.id) {
          setLiveNotification(`Algumas transações foram bloqueadas por ${event.payload?.lockedByUserName}.`);
        }

        setTimeout(() => setLiveNotification(null), 5000);
        fetchTransactions();
      }
    });

    return () => unsubscribe();
  }, [filters]);

  const handleOpenTransactionView = async (tx: Transaction, type: 'DETAILS' | 'EDIT') => {
    if (!currentUser) return;
    try {
      await api.lockTransactions([tx.id], activeSessionId || null, currentUser, type);
      if (type === 'DETAILS') setSelectedTxForDetails(tx);
      if (type === 'EDIT') setTxToEdit(tx);
    } catch (err: any) {
      showBlockMessage(err.message || 'Comprovante em uso.');
    }
  };

  const handleCloseTransactionView = async (tx: Transaction | null, type: 'DETAILS' | 'EDIT') => {
    if (tx && currentUser && !selectedTxIds.includes(tx.id)) {
      await api.unlockTransactions([tx.id], currentUser).catch(console.error);
    }
    if (type === 'DETAILS') setSelectedTxForDetails(null);
    if (type === 'EDIT') setTxToEdit(null);
  };

  const handleSelectAllPendingPage = () => {
    const pendingOnPage = transactions.filter((t) => t.status === 'PENDING' && !t.is_pix_return);
    selectMultiple(pendingOnPage);
  };

  const handleDeleteTransaction = async () => {
    if (!txToDelete) return;
    try {
      setActionLoading(true);
      await api.deleteTransaction(txToDelete.id, currentUser || undefined);
      setTxToDelete(null);
      await fetchTransactions();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir transação.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleIgnoreTransaction = async () => {
    if (!txToIgnore) return;
    try {
      setActionLoading(true);
      await api.ignoreTransaction(txToIgnore.id, ignoreReason, currentUser || undefined);
      setTxToIgnore(null);
      await fetchTransactions();
    } catch (err: any) {
      alert(err.message || 'Erro ao desconsiderar transação.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReturnTransaction = async () => {
    if (!txToReturn) return;
    try {
      setActionLoading(true);
      const isReturned = txToReturn.status === 'RETURNED' || (txToReturn.returned_amount && txToReturn.returned_amount > 0);
      if (isReturned) {
        // Restore
        await api.markPixReturn(txToReturn.id, {
          action: 'RESTORE',
          actorUser: currentUser || undefined
        });
      } else if (returnType === 'PARTIAL') {
        const val = parseFloat(partialReturnAmount.replace(',', '.'));
        const orig = txToReturn.original_amount !== null && txToReturn.original_amount !== undefined ? Number(txToReturn.original_amount) : Number(txToReturn.amount);
        if (isNaN(val) || val <= 0 || val >= orig) {
          alert(`Informe um valor de devolução parcial válido (maior que zero e menor que ${formatCurrency(orig)}).`);
          setActionLoading(false);
          return;
        }
        await api.markPixReturn(txToReturn.id, {
          isPartial: true,
          returnedAmount: val,
          reason: returnReason,
          actorUser: currentUser || undefined
        });
      } else {
        await api.markPixReturn(txToReturn.id, {
          isPartial: false,
          reason: returnReason,
          actorUser: currentUser || undefined
        });
      }
      setTxToReturn(null);
      await fetchTransactions();
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar devolução.');
    } finally {
      setActionLoading(false);
    }
  };

  const percentReconciled =
    stats.total_count && stats.total_count > 0
      ? Math.round(((stats.reconciled_count || 0) / stats.total_count) * 100)
      : 0;

  return (
    <div className="fluent-content-scroll">
      {/* Real-time sync notification banner */}
      {liveNotification && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 px-4 shadow-xs text-xs text-emerald-900 flex items-center justify-between animate-fade-in" style={{marginBottom: '16px'}}>
          <div className="flex items-center space-x-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
            </span>
            <span className="font-bold">{liveNotification}</span>
          </div>
          <button
            onClick={() => setLiveNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="fluent-summary-cards">
        {/* Total Extrato */}
        <div className="fluent-card">
          <div className="fluent-card-header">
            <span className="font-bold">Total Lançamentos</span>
            <Building2 className="w-4 h-4" />
          </div>
          <div className="fluent-card-value">
            {formatCurrency(stats.total_sum)}
          </div>
          <div className="fluent-card-sub">
            {stats.total_count || 0} movimentações
          </div>
        </div>

        {/* Pendentes */}
        <div className="fluent-card warning">
          <div className="fluent-card-header">
            <span className="font-bold">Pendentes de Acerto</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="fluent-card-value">
            {formatCurrency(stats.pending_sum)}
          </div>
          <div className="fluent-card-sub">
            {stats.pending_count || 0} aguardando conferência
          </div>
        </div>

        {/* Conciliadas */}
        <div className="fluent-card success">
          <div className="fluent-card-header">
            <span className="font-bold">Conciliados & Vinculados</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="fluent-card-value">
            {formatCurrency(stats.reconciled_sum)}
          </div>
          <div className="fluent-card-sub flex items-center justify-between">
            <span>{stats.reconciled_count || 0} confirmados</span>
            <span className="font-bold">{percentReconciled}%</span>
          </div>
        </div>

        {/* Devoluções de Pix (Estornados) */}
        <div className="fluent-card danger">
          <div className="fluent-card-header">
            <span className="font-bold">Devoluções / Estornos</span>
            <Undo2 className="w-4 h-4" />
          </div>
          <div className="fluent-card-value">
            {formatCurrency(stats.returned_sum)}
          </div>
          <div className="fluent-card-sub font-bold">
            {stats.returned_count || 0} bloqueados antifraude
          </div>
        </div>

        {/* Desconsiderados / Depósitos em Agência */}
        <div className="fluent-card">
          <div className="fluent-card-header">
            <span className="font-bold">Desconsiderados</span>
            <EyeOff className="w-4 h-4" />
          </div>
          <div className="fluent-card-value">
            {formatCurrency(stats.ignored_sum)}
          </div>
          <div className="fluent-card-sub">
            {stats.ignored_count || 0} fora da prestação
          </div>
        </div>
      </div>

      {/* Main Filter & Search Toolbar */}
      <div className="fluent-controls-section">
        <div className="fluent-filter-tabs">
          {/* Direction Tabs */}
          <button
            onClick={() => setFilters({ ...filters, type: 'CREDIT', page: 1 })}
            className={`fluent-chip ${filters.type === 'CREDIT' ? 'active-green font-bold' : ''}`}
          >
            Entradas (Créditos)
          </button>
          <button
            onClick={() => setFilters({ ...filters, type: 'DEBIT_RETURN', page: 1 })}
            className={`fluent-chip flex items-center gap-1 ${filters.type === 'DEBIT_RETURN' ? 'active-red font-bold' : ''}`}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Pix Devolvidos
          </button>
          <button
            onClick={() => setFilters({ ...filters, type: 'ALL', page: 1 })}
            className={`fluent-chip ${filters.type === 'ALL' ? 'bg-slate-200 text-slate-800 font-bold' : ''}`}
          >
            Todas
          </button>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-solid)', margin: '0 8px' }}></div>

          {/* Status Tabs */}
          <button
            onClick={() => setFilters({ ...filters, status: 'ALL', page: 1 })}
            className={`fluent-chip ${filters.status === 'ALL' ? 'bg-slate-200 font-bold' : ''}`}
          >
            Todos ({stats.total_count || 0})
          </button>
          <button
            onClick={() => setFilters({ ...filters, status: 'PENDING', page: 1 })}
            className={`fluent-chip ${filters.status === 'PENDING' ? 'active-yellow font-bold' : ''}`}
          >
            Pendentes ({stats.pending_count || 0})
          </button>
          <button
            onClick={() => setFilters({ ...filters, status: 'RECONCILED', page: 1 })}
            className={`fluent-chip ${filters.status === 'RECONCILED' ? 'active-green font-bold' : ''}`}
          >
            Conciliadas ({stats.reconciled_count || 0})
          </button>
          <button
            onClick={() => setFilters({ ...filters, status: 'RETURNED', page: 1 })}
            className={`fluent-chip ${filters.status === 'RETURNED' ? 'active-red font-bold' : ''}`}
          >
            Devoluções ({stats.returned_count || 0})
          </button>
          <button
            onClick={() => setFilters({ ...filters, status: 'IGNORED', page: 1 })}
            className={`fluent-chip ${filters.status === 'IGNORED' ? 'bg-slate-200 font-bold' : ''}`}
          >
            Desconsideradas ({stats.ignored_count || 0})
          </button>
        </div>
        
        <div className="flex flex-wrap items-center justify-between gap-2.5 mt-4">
          {/* Quick Filter: Unidentified Payer (Sem Remetente) */}
          <button
            onClick={() => setFilters({ ...filters, unidentified_payer: !filters.unidentified_payer, page: 1 })}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-all cursor-pointer border ${
              filters.unidentified_payer
                ? 'bg-amber-600 text-white border-amber-700 shadow-xs ring-2 ring-amber-200'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100 hover:border-amber-300'
            }`}
            title="Filtrar lançamentos cujo remetente/pagador ainda não foi identificado"
          >
            <UserX className="w-3.5 h-3.5 text-amber-600" />
            <span>Sem Remetente</span>
            {stats.unidentified_payer_count !== undefined && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  filters.unidentified_payer ? 'bg-amber-800 text-amber-100' : 'bg-amber-200/80 text-amber-950'
                }`}
              >
                {stats.unidentified_payer_count}
              </span>
            )}
          </button>

          {/* Quick Sort Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xl text-xs">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-500 font-bold text-[11px] whitespace-nowrap">Ordenar:</span>
            <select
              value={filters.order_by || 'DATE_DESC'}
              onChange={(e) => setFilters({ ...filters, order_by: e.target.value as any, page: 1 })}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
            >
              <option value="DATE_DESC">📅 Data mais recente</option>
              <option value="DATE_ASC">📅 Data mais antiga</option>
              <option value="AMOUNT_DESC">💰 Maior valor</option>
              <option value="AMOUNT_ASC">💰 Menor valor</option>
            </select>
          </div>

          {/* Advanced Filters Button */}
          <button
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              showAdvancedFilters || filters.bank !== 'ALL' || filters.is_pix || filters.unidentified_payer || filters.start_date
                ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-100 shadow-2xs'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filtros Detalhados</span>
          </button>
        </div>

        {/* Row 2: Full-Width Search Input (Large, Spacious & Highly Visible) */}
        <div className="relative w-full">
          <Search className="w-5 h-5 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquisar por nome do pagador/cliente, descrição completa, CPF/CNPJ, FITID, motorista, valor ou número do documento..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-11 pr-10 py-2.5 text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-100 transition-all shadow-2xs"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 p-1 rounded-full hover:bg-slate-200 cursor-pointer transition-colors"
              title="Limpar pesquisa"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Advanced Filters Drawer */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Ordenação</label>
              <select
                value={filters.order_by || 'DATE_DESC'}
                onChange={(e) => setFilters({ ...filters, order_by: e.target.value as any, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-blue-500"
              >
                <option value="DATE_DESC">Data mais recente</option>
                <option value="DATE_ASC">Data mais antiga</option>
                <option value="AMOUNT_DESC">Maior valor primeiro</option>
                <option value="AMOUNT_ASC">Menor valor primeiro</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Banco / Conta</label>
              <select
                value={filters.bank}
                onChange={(e) => setFilters({ ...filters, bank: e.target.value, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos os Bancos</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.bank_name}>
                    {b.bank_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Tipo de Lançamento</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as any, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="CREDIT">Entradas / Recebimentos (Crédito)</option>
                <option value="DEBIT">Saídas / Despesas (Débito)</option>
                <option value="ALL">Todos os Tipos</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Motorista Vinculado</label>
              <select
                value={filters.driver_id}
                onChange={(e) => setFilters({ ...filters, driver_id: e.target.value, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="ALL">Todos os Motoristas</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({formatPlate(d.vehicle_plate)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Data Inicial</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Data Final</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value, page: 1 })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="sm:col-span-2 flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="filter-pix"
                checked={filters.is_pix}
                onChange={(e) => setFilters({ ...filters, is_pix: e.target.checked, page: 1 })}
                className="w-4 h-4 rounded text-blue-600 bg-white border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="filter-pix" className="text-slate-700 font-bold cursor-pointer">
                Exibir apenas Pix
              </label>
            </div>

            <div className="sm:col-span-2 flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="filter-unidentified"
                checked={!!filters.unidentified_payer}
                onChange={(e) => setFilters({ ...filters, unidentified_payer: e.target.checked, page: 1 })}
                className="w-4 h-4 rounded text-amber-600 bg-white border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="filter-unidentified" className="text-amber-900 font-bold cursor-pointer">
                Sem remetente identificado
              </label>
            </div>

            <div className="sm:col-span-2 flex justify-end items-center pt-2">
              <button
                onClick={() =>
                  setFilters({
                    status: 'ALL',
                    bank: 'ALL',
                    driver_id: 'ALL',
                    is_pix: false,
                    unidentified_payer: false,
                    type: 'CREDIT',
                    search: '',
                    start_date: '',
                    end_date: '',
                    order_by: 'DATE_DESC',
                    page: 1,
                    limit: 50
                  })
                }
                className="text-xs text-slate-500 hover:text-blue-700 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Informative banner when filtering by unidentified payers */}
      {filters.unidentified_payer && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-950 shadow-2xs">
          <UserX className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-extrabold text-sm block text-amber-950">
                Filtro Ativo: Lançamentos sem Remetente Identificado ({transactions.length} nesta página)
              </span>
              <p className="mt-0.5 leading-relaxed text-slate-700">
                Consulte o comprovante do banco e clique no botão de <strong>Lápis (✏️)</strong> na coluna de ações de cada linha para informar o nome e documento do pagador.
              </p>
            </div>
            <button
              onClick={() => setFilters({ ...filters, unidentified_payer: false, page: 1 })}
              className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer shrink-0 transition-colors"
            >
              Remover Filtro
            </button>
          </div>
        </div>
      )}

      {/* Sub-bar with selection helpers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-xs">
        <div className="flex items-center space-x-2">
          {isSessionActive && activeDriver ? (
            <div className="flex items-center space-x-2 text-slate-900 font-medium">
              <span className="font-bold text-blue-700">Modo de Seleção Ativo:</span>
              <span>Marque os recebimentos que pertencem a {activeDriver.name}.</span>
              <button
                onClick={handleSelectAllPendingPage}
                className="ml-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 font-bold cursor-pointer"
              >
                Selecionar Todos Válidos Desta Página
              </button>
            </div>
          ) : selectedForDeletion.length > 0 ? (
            <div className="flex items-center space-x-2">
              <span className="font-bold text-red-700">{selectedForDeletion.length} selecionado(s)</span>
              <button
                onClick={async () => {
                  if (confirm(`Tem certeza que deseja excluir ${selectedForDeletion.length} lançamentos?`)) {
                    setIsDeletingBulk(true);
                    try {
                      await api.deleteManyTransactions(selectedForDeletion, currentUser!);
                      setSelectedForDeletion([]);
                      fetchTransactions();
                    } catch (err: any) {
                      alert(err.message);
                    } finally {
                      setIsDeletingBulk(false);
                    }
                  }
                }}
                disabled={isDeletingBulk}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {isDeletingBulk ? 'Excluindo...' : 'Excluir Selecionados'}
              </button>
            </div>
          ) : (
            <div className="text-slate-500 flex items-center space-x-1.5">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              <span>
                Para acertos, inicie uma conciliação informando o motorista. Lançamentos estornados ou desconsiderados ficam travados com segurança.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 text-slate-600">
          <span>
            Exibindo <strong>{transactions.length}</strong> de{' '}
            <strong>{pagination.totalItems}</strong> lançamentos
          </span>
        </div>
      </div>

      {/* Informative banner when viewing DEBITs / Saídas */}
      {filters.type === 'DEBIT' && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-red-900 shadow-2xs">
          <RotateCcw className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-extrabold text-sm block text-red-950">
              Modo de Saídas de Devolução (Estornos e Pagamentos no Extrato)
            </span>
            <p className="mt-0.5 leading-relaxed text-slate-700">
              Cada linha abaixo é uma <strong>saída/débito</strong> do extrato bancário. Para vincular uma saída de estorno à sua respectiva entrada de Pix e <strong>bloquear permanentemente a entrada contra conciliação de motoristas</strong>, clique no botão <strong>"Relacionar à Entrada"</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Main Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-sm font-semibold text-slate-600">
              Carregando lançamentos com sincronização em tempo real...
            </p>
          </div>
        ) : errorMsg ? (
          <div className="p-12 text-center text-slate-600 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800">Falha ao carregar lançamentos</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{errorMsg}</p>
            <div className="pt-2">
              <button
                onClick={() => fetchTransactions()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Recarregar Lançamentos</span>
              </button>
            </div>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto" />
            <h4 className="text-base font-bold text-slate-800">Nenhum lançamento encontrado</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Ajuste os filtros de pesquisa ou importe um arquivo de extrato bancário (OFX/CSV).
            </p>
            <div className="pt-2">
              <button
                onClick={onOpenUpload}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Importar Arquivo de Extrato
              </button>
            </div>
          </div>
        ) : (
          <div className="fluent-table-container">
            <table className="fluent-table">
              <thead className="sticky top-0 z-10 bg-[#f9fbfd] shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <tr>
                  <th className="py-3.5 px-4 w-12 text-center">
                    {isSessionActive ? (
                      'Seleção'
                    ) : (
                      <input
                        type="checkbox"
                        checked={selectedForDeletion.length > 0 && selectedForDeletion.length === transactions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedForDeletion(transactions.filter(t => t.status === 'PENDING').map(t => t.id));
                          } else {
                            setSelectedForDeletion([]);
                          }
                        }}
                        className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    )}
                  </th>
                  
                  <th className="py-3.5 px-2 text-center font-bold text-slate-400">#</th>

                  {/* Clickable Date Sort Header */}
                  <th className="py-3.5 px-4">
                    <button
                      onClick={() =>
                        setFilters({
                          ...filters,
                          order_by: filters.order_by === 'DATE_DESC' ? 'DATE_ASC' : 'DATE_DESC',
                          page: 1
                        })
                      }
                      className="inline-flex items-center space-x-1 font-extrabold text-slate-700 hover:text-blue-700 cursor-pointer uppercase transition-colors"
                      title="Clique para alternar ordenação por data"
                    >
                      <span>Data</span>
                      {filters.order_by === 'DATE_DESC' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : filters.order_by === 'DATE_ASC' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </button>
                  </th>

                  <th className="py-3.5 px-4">Banco / Conta</th>
                  <th className="py-3.5 px-4 min-w-[300px]">Histórico / Descrição Completa</th>
                  <th className="py-3.5 px-4">Documento / Pix</th>

                  {/* Clickable Amount Sort Header */}
                  <th className="py-3.5 px-4 text-right">
                    <button
                      onClick={() =>
                        setFilters({
                          ...filters,
                          order_by: filters.order_by === 'AMOUNT_DESC' ? 'AMOUNT_ASC' : 'AMOUNT_DESC',
                          page: 1
                        })
                      }
                      className="inline-flex items-center space-x-1 font-extrabold text-slate-700 hover:text-blue-700 cursor-pointer uppercase transition-colors ml-auto"
                      title="Clique para alternar ordenação por valor"
                    >
                      <span>Valor (R$)</span>
                      {filters.order_by === 'AMOUNT_DESC' ? (
                        <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : filters.order_by === 'AMOUNT_ASC' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </button>
                  </th>

                  <th className="py-3.5 px-4">Situação & Vínculo Motorista</th>
                  <th className="py-3.5 px-4 text-center w-36">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx, index) => {
                  const isReconciled = tx.status === 'RECONCILED';
                  const isReturned = tx.status === 'RETURNED' || tx.is_pix_return === 1 || tx.is_pix_return === true;
                  const isIgnored = tx.status === 'IGNORED';
                  const isSelected = selectedTxIds.includes(tx.id);
                  const isPix = tx.is_pix === 1 || tx.is_pix === true;
                  const isCobranca = tx.description && tx.description.toLowerCase().includes('cobrança');
                  const isDebit = tx.type === 'DEBIT';
                  const isTemporarilyLockedByOther = tx.locked_by_user_id && tx.locked_by_user_id !== currentUser?.id;
                  const isBlockedFromSelection = isReconciled || isReturned || isIgnored || isDebit || isTemporarilyLockedByOther;

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => {
                        if (isSessionActive && !isBlockedFromSelection) {
                          toggleTransaction(tx);
                        } else if (isDebit) {
                          setDebitTxForLinking(tx);
                        } else {
                          handleOpenTransactionView(tx, 'DETAILS');
                        }
                      }}
                      className={`transition-colors ${
                        isReconciled
                          ? 'bg-slate-50/70 text-slate-600'
                          : isReturned
                          ? 'bg-red-50/40 text-red-950 font-medium'
                          : isIgnored
                          ? 'bg-slate-100/50 text-slate-500 line-through decoration-slate-400'
                          : isDebit
                          ? 'bg-amber-50/30 hover:bg-amber-50/60 cursor-pointer'
                          : isTemporarilyLockedByOther
                          ? 'bg-slate-50/50 text-slate-500 cursor-not-allowed'
                          : isSelected
                          ? 'bg-blue-50/90 border-l-4 border-l-blue-600 font-semibold cursor-pointer'
                          : isSessionActive
                          ? 'hover:bg-slate-50 cursor-pointer'
                          : 'hover:bg-slate-50/60 cursor-pointer'
                      }`}
                    >
                      {/* Checkbox or Locked Icon */}
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        {isReconciled ? (
                          <div
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-2xs"
                            title={`TRAVADO: Já conferido e conciliado para o motorista ${tx.driver_name}`}
                          >
                            <Lock className="w-3.5 h-3.5 text-emerald-700" />
                          </div>
                        ) : isReturned ? (
                          <div
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 text-red-700 border border-red-300"
                            title="BLOQUEADO: Devolução de Pix (estornado ao cliente). Não pode ser conciliada!"
                          >
                            <Undo2 className="w-3.5 h-3.5 text-red-700" />
                          </div>
                        ) : isIgnored ? (
                          <div
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-200 text-slate-600 border border-slate-300"
                            title="DESCONSIDERADO: Fora da prestação de contas (ex: depósito em agência)"
                          >
                            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                        ) : isDebit ? (
                          <button
                            type="button"
                            onClick={() => setDebitTxForLinking(tx)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 cursor-pointer"
                            title="Saída do extrato: clique para relacionar a uma devolução"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-red-700" />
                          </button>
                        ) : isTemporarilyLockedByOther ? (
                          <div
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-500 border border-slate-200"
                            title={`Em uso: bloqueado temporariamente por ${tx.locked_by_user_name}`}
                          >
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        ) : isSessionActive ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTransaction(tx)}
                            className="w-4 h-4 rounded text-blue-600 bg-white border-slate-300 focus:ring-blue-500 cursor-pointer"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            checked={selectedForDeletion.includes(tx.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedForDeletion([...selectedForDeletion, tx.id]);
                              } else {
                                setSelectedForDeletion(selectedForDeletion.filter(id => id !== tx.id));
                              }
                            }}
                            className="w-4 h-4 rounded text-red-600 bg-white border-slate-300 focus:ring-red-500 cursor-pointer"
                          />
                        )}
                      </td>

                      <td className="py-3 px-2 text-center text-slate-400 font-mono font-bold text-[10px]">
                        {(pagination.page - 1) * pagination.limit + index + 1}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 font-mono whitespace-nowrap text-slate-700 font-medium">
                        {formatDate(tx.date)}
                      </td>

                      {/* Bank */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900">{tx.bank_name}</span>
                        {tx.bank_code && (
                          <span className="text-[10px] text-slate-500 block">Cód: {tx.bank_code}</span>
                        )}
                      </td>

                      {/* Description & Counterparty (Full un-truncated) */}
                      <td className="py-3 px-4 min-w-[280px]">
                        {/* Payer / Counterparty highlighted if available */}
                        {tx.counterparty_name && (
                          <div className="text-xs font-black text-slate-900 flex items-center gap-1.5 mb-1 bg-blue-50 text-blue-950 px-2 py-0.5 rounded-md border border-blue-200/80 inline-flex">
                            <User className="w-3 h-3 text-blue-600 shrink-0" />
                            <span>{tx.counterparty_name}</span>
                            {tx.counterparty_doc && (
                              <span className="text-[10px] text-slate-500 font-mono font-normal">
                                ({tx.counterparty_doc})
                              </span>
                            )}
                          </div>
                        )}

                        <div className="font-semibold text-slate-900 text-xs break-words leading-relaxed">
                          {isPix && (
                            <img src="/logopix.png" alt="PIX" className="h-[18px] inline-block mr-1.5 align-text-bottom" />
                          )}
                          {isCobranca && !isPix && (
                            <img src="/cobrança.png" alt="Cobrança" className="h-[18px] inline-block mr-1.5 align-text-bottom" />
                          )}
                          {isReturned && (
                            <span className="bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 inline-block">
                              ESTORNO / DEVOLUÇÃO TOTAL
                            </span>
                          )}
                          {tx.returned_amount > 0 && !isReturned && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[9px] font-bold mr-1.5 inline-block">
                              ✂ DEVOLUÇÃO PARCIAL (-{formatCurrency(tx.returned_amount)})
                            </span>
                          )}
                          {isDebit && (
                            <span className="bg-red-50 text-red-700 border border-red-200 px-1 py-0.2 rounded text-[9px] font-mono font-bold mr-1.5 inline-block">
                              SAÍDA (DÉBITO)
                            </span>
                          )}
                          <span>{tx.description}</span>
                        </div>

                        {tx.memo && tx.memo !== tx.description && (
                          <div className="text-[11px] text-slate-500 break-words mt-0.5 font-mono">
                            {tx.memo}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenTransactionView(tx, 'DETAILS');
                          }}
                          className="mt-1 text-[11px] text-blue-600 hover:text-blue-800 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3 h-3" />
                          <span>Ver dados completos do arquivo</span>
                        </button>
                      </td>

                      {/* Document / FITID */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {tx.document_number || tx.fitid || '-'}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-extrabold whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span
                            className={`text-sm ${
                              isReturned || isDebit
                                ? 'text-red-700 font-bold'
                                : 'text-emerald-600'
                            }`}
                          >
                            {tx.type === 'CREDIT' ? '+' : '-'} {formatCurrency(tx.amount)}
                          </span>
                          {tx.returned_amount > 0 && !isReturned && (
                            <span className="text-[10px] text-slate-400 font-normal font-sans tracking-tight">
                              Original: {formatCurrency(tx.original_amount || (tx.amount + tx.returned_amount))}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status & Driver Link */}
                      <td className="py-3 px-4">
                        {isReconciled ? (
                          <div className="space-y-1">
                            <div className="inline-flex items-center space-x-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded-md text-[11px] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                              <span>{isDebit ? 'Saída Vinculada' : 'Conciliado & Bloqueado'}</span>
                            </div>
                            {tx.driver_name && (
                              <div className="text-[11px] text-slate-800 font-bold flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">
                                  <span>{tx.driver_name}</span> <LicensePlateBadge plate={tx.driver_plate} className="scale-75 origin-left" />
                                </span>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-500">
                              {tx.reconciled_by_user_name ? `Por ${tx.reconciled_by_user_name} • ` : ''}
                              {tx.reconciled_at ? formatDateTime(tx.reconciled_at) : ''}
                              {tx.notes && <span className="block text-slate-600 mt-0.5">{tx.notes}</span>}
                            </div>
                          </div>
                        ) : isReturned ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center space-x-1 bg-red-100 text-red-900 border border-red-300 px-2 py-0.5 rounded-md text-[11px] font-bold">
                              <Lock className="w-3 h-3 text-red-700" />
                              <span>BLOQUEADA - DEVOLVIDA AO CLIENTE</span>
                            </span>
                            <p className="text-[10px] text-red-700 font-semibold leading-tight">
                              {tx.return_reason || 'Bloqueado para conciliação com motoristas'}
                            </p>
                            {tx.linked_tx_id && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenTransactionView(tx, 'DETAILS');
                                }}
                                className="text-[10px] text-blue-700 hover:underline font-bold block"
                              >
                                Ver saída de estorno vinculada
                              </button>
                            )}
                          </div>
                        ) : isIgnored ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center space-x-1 bg-slate-200 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-md text-[11px] font-bold">
                              <EyeOff className="w-3 h-3 text-slate-600" />
                              <span>Desconsiderado da Prestação</span>
                            </span>
                            <p className="text-[10px] text-slate-500 truncate">
                              {tx.notes || 'Depósito em agência / fora de acerto'}
                            </p>
                          </div>
                        ) : isDebit ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center space-x-1 bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                              <RotateCcw className="w-3 h-3 text-amber-600" />
                              <span>Saída Pendente de Vínculo</span>
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md text-[11px] font-semibold">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Aguardando Conferência</span>
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1.5 flex-wrap gap-y-1">
                          {/* If Debit: prominent link return button */}
                          {isDebit && !isReconciled && (
                            <button
                              type="button"
                              onClick={() => setDebitTxForLinking(tx)}
                              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-bold px-2 py-1 rounded-xl text-xs flex items-center space-x-1 shadow-2xs cursor-pointer whitespace-nowrap"
                              title="Relacionar esta saída a uma entrada e bloquear a entrada de ser conciliada"
                            >
                              <RotateCcw className="w-3 h-3 text-red-600" />
                              <span>Relacionar</span>
                            </button>
                          )}

                          {/* Reopen (Admin only) if Reconciled */}
                          {isReconciled && canReopen && (
                            <button
                              onClick={() => onOpenReopenModal(tx)}
                              className="text-slate-400 hover:text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                              title="Reabrir/Desbloquear conciliação (Ação Administrativa)"
                            >
                              <LockOpen className="w-4 h-4" />
                            </button>
                          )}

                          {/* View Full Details Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenTransactionView(tx, 'DETAILS')}
                            className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                            title="Ver todos os detalhes e dados brutos deste lançamento"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Admin only: Edit counterparty name / description */}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleOpenTransactionView(tx, 'EDIT')}
                              className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                              title="Editar descrição ou nome do remetente verificado no banco (Administrador)"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {/* Not Reconciled actions */}
                          {!isReconciled && !isDebit && (
                            <>
                              {/* Admin only: Toggle Pix Return */}
                              {isAdmin && (
                                <button
                                  onClick={() => setTxToReturn(tx)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isReturned
                                      ? 'text-red-700 bg-red-100 hover:bg-red-200'
                                      : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                  }`}
                                  title={
                                    isReturned
                                      ? 'Remover marcação de devolução (Administrador)'
                                      : 'Marcar como Devolução de Pix (estornado ao cliente) (Administrador)'
                                  }
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                              )}

                              {/* Admin only: Toggle Ignore (Desconsiderar depósito etc.) */}
                              {isAdmin && (
                                <button
                                  onClick={() => setTxToIgnore(tx)}
                                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                    isIgnored
                                      ? 'text-slate-800 bg-slate-200 hover:bg-slate-300'
                                      : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                  }`}
                                  title={
                                    isIgnored
                                      ? 'Reativar para conciliação (Administrador)'
                                      : 'Desconsiderar lançamento (Administrador)'
                                  }
                                >
                                  {isIgnored ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                              )}

                              {/* Admin only: Delete single transaction */}
                              {isAdmin && (
                                <button
                                  onClick={() => setTxToDelete(tx)}
                                  className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                                  title="Excluir este lançamento do extrato (Administrador)"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setFilters({ ...filters, page: Math.max(1, filters.page - 1) })}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() =>
                  setFilters({ ...filters, page: Math.min(pagination.totalPages, filters.page + 1) })}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Delete Transaction */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Excluir Transação do Extrato</h3>
                  <p className="text-xs text-slate-500">Exclusão permanente do lançamento</p>
                </div>
              </div>
              <button
                onClick={() => setTxToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-700">
                Tem certeza que deseja excluir esta transação do sistema?
              </p>

              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                <p className="font-bold text-slate-900">{txToDelete.description}</p>
                <p className="text-emerald-600 font-mono font-extrabold text-sm">
                  {formatCurrency(txToDelete.amount)} • {formatDate(txToDelete.date)}
                </p>
                <p className="text-slate-500">{txToDelete.bank_name}</p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleDeleteTransaction}
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{actionLoading ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ignore / Desconsiderar Transação (ex: depósito em agência) */}
      {txToIgnore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="bg-slate-200 p-2 rounded-xl text-slate-700 border border-slate-300">
                  <EyeOff className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {txToIgnore.status === 'IGNORED' ? 'Reativar Lançamento' : 'Desconsiderar Lançamento'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {txToIgnore.status === 'IGNORED'
                      ? 'Tornar transação disponível para conciliação'
                      : 'Não aplicável ao acerto de motoristas (ex: depósito em agência)'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTxToIgnore(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1">
                <p className="font-bold text-slate-900">{txToIgnore.description}</p>
                <p className="text-emerald-600 font-mono font-extrabold text-sm">
                  {formatCurrency(txToIgnore.amount)} • {formatDate(txToIgnore.date)}
                </p>
              </div>

              {txToIgnore.status !== 'IGNORED' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Motivo pelo qual não pertence a prestação de contas:
                  </label>
                  <input
                    type="text"
                    value={ignoreReason}
                    onChange={(e) => setIgnoreReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                    placeholder="Ex: Depósito bancário realizado diretamente na agência"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    O lançamento continuará registrado no extrato para contabilidade, mas não aparecerá para os motoristas.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTxToIgnore(null)}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleIgnoreTransaction}
                disabled={actionLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
              >
                {actionLoading
                  ? 'Salvando...'
                  : txToIgnore.status === 'IGNORED'
                  ? 'Reativar para Conciliação'
                  : 'Confirmar e Desconsiderar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Mark Pix Return (Estorno / Devolução de Pix ao Cliente) */}
      {txToReturn && (() => {
        const origVal = txToReturn.original_amount !== null && txToReturn.original_amount !== undefined ? Number(txToReturn.original_amount) : Number(txToReturn.amount);
        const parsedPartial = parseFloat(partialReturnAmount.replace(',', '.')) || 0;
        const validPartial = parsedPartial > 0 && parsedPartial < origVal;
        const calculatedNet = Math.max(0, origVal - parsedPartial);
        const isCurrentlyReturnedOrPartial = txToReturn.status === 'RETURNED' || (txToReturn.returned_amount && txToReturn.returned_amount > 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50/80">
                <div className="flex items-center space-x-3">
                  <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
                    <Undo2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900">
                      {isCurrentlyReturnedOrPartial
                        ? 'Restaurar Lançamento ao Valor Original'
                        : 'Identificar Devolução / Estorno de Pix'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Suporte a devolução total (100%) ou devolução parcial
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setTxToReturn(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3.5 text-xs">
                {/* Transaction summary header */}
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Entrada Original:</span>
                    <span className="text-emerald-700 font-mono font-extrabold text-sm">
                      + {formatCurrency(origVal)}
                    </span>
                  </div>
                  <p className="font-bold text-slate-900 leading-snug">{txToReturn.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span>{txToReturn.bank_name}</span>
                    <span>Data: {formatDate(txToReturn.date)}</span>
                  </div>
                </div>

                {!isCurrentlyReturnedOrPartial ? (
                  <>
                    {/* Return Type Selector: Total vs Partial */}
                    <div>
                      <label className="block font-bold text-slate-800 mb-1.5">
                        Tipo de Devolução / Estorno:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setReturnType('TOTAL')}
                          className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition-all ${
                            returnType === 'TOTAL'
                              ? 'bg-red-50 border-red-400 text-red-800 ring-2 ring-red-200 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          Devolução Total (100%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setReturnType('PARTIAL')}
                          className={`p-2.5 rounded-xl border font-bold text-xs cursor-pointer text-center transition-all ${
                            returnType === 'PARTIAL'
                              ? 'bg-blue-50 border-blue-400 text-blue-800 ring-2 ring-blue-200 shadow-2xs'
                              : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                          }`}
                        >
                          Devolução Parcial
                        </button>
                      </div>
                    </div>

                    {/* Partial amount input */}
                    {returnType === 'PARTIAL' && (
                      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-2.5">
                        <div>
                          <label className="block font-bold text-blue-950 mb-1">
                            Valor Devolvido ao Cliente (R$):
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500 font-mono">
                              R$
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              max={origVal - 0.01}
                              value={partialReturnAmount}
                              onChange={(e) => setPartialReturnAmount(e.target.value)}
                              placeholder={`Ex: ${(origVal * 0.2).toFixed(2)}`}
                              className="w-full bg-white border border-blue-300 rounded-xl pl-9 pr-3 py-2 text-sm font-mono font-extrabold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                          </div>
                        </div>

                        {/* Calculation preview */}
                        {validPartial && (
                          <div className="border-t border-blue-200 pt-2 space-y-1 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-slate-600">
                              <span>Depositado original:</span>
                              <strong>{formatCurrency(origVal)}</strong>
                            </div>
                            <div className="flex items-center justify-between text-red-700">
                              <span>(-) Estorno devolvido:</span>
                              <strong>- {formatCurrency(parsedPartial)}</strong>
                            </div>
                            <div className="flex items-center justify-between font-bold text-emerald-800 text-xs pt-1 border-t border-blue-100">
                              <span>(=) Novo saldo a conciliar:</span>
                              <span className="text-sm font-extrabold">{formatCurrency(calculatedNet)}</span>
                            </div>
                            <p className="text-[10px] text-blue-800 font-sans pt-1">
                              ✓ A transação <strong>permanecerá disponível</strong> para conciliação com o motorista pelo valor de <strong>{formatCurrency(calculatedNet)}</strong>.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {returnType === 'TOTAL' && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-[11px] leading-relaxed">
                        <p className="font-bold flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Bloqueio Total:</span>
                        </p>
                        <p className="mt-0.5">
                          O lançamento de {formatCurrency(origVal)} será bloqueado integralmente (status <strong>RETURNED</strong>) e não poderá ser conciliado com motoristas.
                        </p>
                      </div>
                    )}

                    {/* Reason input */}
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Justificativa do Estorno / Devolução:
                      </label>
                      <input
                        type="text"
                        value={returnReason}
                        onChange={(e) => setReturnReason(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-red-500 shadow-xs"
                        placeholder="Ex: Devolução por cancelamento de item / diferença de pedido"
                      />
                    </div>
                  </>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs space-y-1">
                    <p className="font-bold">Restaurar este lançamento?</p>
                    <p className="text-[11px]">
                      O status de devolução será removido e o lançamento voltará a valer <strong>{formatCurrency(origVal)}</strong> como Pendente normal no extrato.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setTxToReturn(null)}
                  className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleMarkReturnTransaction}
                  disabled={actionLoading || (returnType === 'PARTIAL' && !validPartial && !isCurrentlyReturnedOrPartial)}
                  className={`font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer shadow-xs disabled:opacity-50 ${
                    isCurrentlyReturnedOrPartial
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : returnType === 'PARTIAL'
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {actionLoading
                    ? 'Salvando...'
                    : isCurrentlyReturnedOrPartial
                    ? 'Restaurar para Valor Integral'
                    : returnType === 'PARTIAL'
                    ? `Confirmar Parcial (Saldo: ${formatCurrency(calculatedNet)})`
                    : 'Confirmar Devolução Total'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Link Debit Return to Credit Entry */}
      <LinkReturnModal
        debitTx={debitTxForLinking}
        isOpen={!!debitTxForLinking}
        onClose={() => setDebitTxForLinking(null)}
        onSuccess={() => fetchTransactions()}
      />

      {/* Modal: Transaction Full Details & Raw File Inspection */}
      <TransactionDetailsModal
        transaction={selectedTxForDetails}
        isOpen={!!selectedTxForDetails}
        onClose={() => handleCloseTransactionView(selectedTxForDetails, 'DETAILS')}
        onUpdated={() => fetchTransactions()}
        onOpenLinkReturn={(tx) => setDebitTxForLinking(tx)}
        onOpenEdit={(tx) => {
          handleCloseTransactionView(selectedTxForDetails, 'DETAILS');
          handleOpenTransactionView(tx, 'EDIT');
        }}
      />

      {/* Modal: Admin Manual Edit of Counterparty & Description */}
      <EditTransactionModal
        transaction={txToEdit}
        isOpen={!!txToEdit}
        onClose={() => handleCloseTransactionView(txToEdit, 'EDIT')}
        onSuccess={() => fetchTransactions()}
      />
    </div>
  );
};
