import {
  Company,
  User,
  Driver,
  BankAccount,
  ImportBatch,
  Transaction,
  ReconciliationSession,
  TransactionStats,
  TransactionFilters,
  AuditLog
} from '../types';

export const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val);
};

export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '-';
  // Handles YYYY-MM-DD or ISO strings
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export const formatDateTime = (isoStr: string | undefined | null): string => {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
};

export const formatPlate = (plate: string | undefined | null): string => {
  if (!plate) return '';
  const clean = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 7) {
    // Mercosul or Standard
    return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  }
  return plate.toUpperCase();
};

export const formatCpf = (cpf: string | undefined | null): string => {
  if (!cpf) return '';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }
  return cpf;
};

// SSE real-time event subscription
type EventCallback = (event: { type: string; payload: any; timestamp: string }) => void;
const eventListeners: EventCallback[] = [];
let eventSource: EventSource | null = null;

export function subscribeToRealtimeEvents(callback: EventCallback): () => void {
  eventListeners.push(callback);

  if (!eventSource && typeof window !== 'undefined') {
    connectSse();
  }

  return () => {
    const idx = eventListeners.indexOf(callback);
    if (idx !== -1) eventListeners.splice(idx, 1);
  };
}

function connectSse() {
  try {
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        eventListeners.forEach((cb) => cb(parsed));
      } catch (err) {
        // ignore non-json messages like heartbeat
      }
    };

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      // Reconnect after 3s
      setTimeout(connectSse, 3000);
    };
  } catch (err) {
    console.error('SSE initialization error:', err);
  }
}

let globalCompanyId = typeof window !== 'undefined' ? localStorage.getItem('conciliapix_selected_company') || 'matriz' : 'matriz';

export function getGlobalCompanyId(): string {
  return globalCompanyId;
}

export function setGlobalCompanyId(id: string): void {
  globalCompanyId = id;
}

const customFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const headers = new Headers(init?.headers || {});
  if (!headers.has('x-company-id')) {
    headers.set('x-company-id', globalCompanyId);
  }

  // Bypass browser cache for GET requests
  let fetchUrl = typeof url === 'string' ? url : url.toString();
  const method = init?.method || 'GET';
  if (method.toUpperCase() === 'GET') {
    const separator = fetchUrl.includes('?') ? '&' : '?';
    fetchUrl += `${separator}_t=${Date.now()}`;
  }

  const controller = new AbortController();
  // 10s Timeout defined for performance & infinite loading resolution
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const signal = init?.signal || controller.signal;
    const response = await fetch(fetchUrl, { ...init, headers, signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido. O servidor demorou mais de 10 segundos para responder.');
    }
    throw err;
  }
};

// API methods
export const api = {
  // Global company switcher helper
  setGlobalCompanyId,
  getGlobalCompanyId,

  // Companies
  async getCompanies(): Promise<Company[]> {
    const res = await customFetch('/api/companies');
    if (!res.ok) throw new Error('Falha ao carregar empresas');
    return res.json();
  },

  // Auth & Users
  async login(emailOrId: string, password: string): Promise<{ success: boolean; user: User }> {
    const res = await customFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrId, password })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao autenticar.');
    return json;
  },

  async logout(): Promise<void> {
    await customFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  },

  async getMe(): Promise<User> {
    const res = await customFetch('/api/auth/me');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Não autenticado.');
    return json.user;
  },

  async changePassword(data: {
    userId: string;
    currentPassword?: string;
    newPassword: string;
    actorUser?: User;
  }): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao alterar senha.');
    return json;
  },

  async getUsers(): Promise<User[]> {
    const res = await customFetch('/api/users');
    if (!res.ok) throw new Error('Falha ao carregar usuários');
    return res.json();
  },

  async createUser(data: { name: string; email: string; role: string; pin?: string; allowed_companies?: string[] }, actorUser: User): Promise<User> {
    const res = await customFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao cadastrar usuário');
    return json;
  },

  async updateUser(id: string, data: Partial<User>, actorUser: User): Promise<User> {
    const res = await customFetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar usuário');
    return json;
  },

  async deleteUser(id: string, actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch(`/api/users/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao excluir usuário');
    return json;
  },

  // Drivers
  async getDrivers(): Promise<Driver[]> {
    const res = await customFetch('/api/drivers');
    if (!res.ok) throw new Error('Falha ao carregar motoristas');
    return res.json();
  },

  async createDriver(driverData: Partial<Driver>, actorUser: User): Promise<Driver> {
    const res = await customFetch('/api/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...driverData, company_id: driverData.company_id || globalCompanyId, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao cadastrar motorista');
    return json;
  },

  async updateDriver(id: string, driverData: Partial<Driver>, actorUser: User): Promise<Driver> {
    const res = await customFetch(`/api/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...driverData, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar motorista');
    return json;
  },

  // Banks
  async getBanks(): Promise<BankAccount[]> {
    const res = await customFetch('/api/banks');
    if (!res.ok) throw new Error('Falha ao carregar contas bancárias');
    return res.json();
  },

  // Statements upload & batches
  async uploadStatement(data: {
    filename: string;
    content: string;
    format: 'OFX' | 'CSV';
    bankName: string;
    bankCode?: string;
    actorUser: User;
    company_id?: string;
  }): Promise<{
    success: boolean;
    batchId: string;
    importedCount: number;
    skippedDuplicateCount: number;
    totalTransactionsInFile: number;
    bankName: string;
  }> {
    const res = await customFetch('/api/statements/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, company_id: data.company_id || globalCompanyId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao importar extrato');
    return json;
  },

  async getBatches(): Promise<ImportBatch[]> {
    const res = await customFetch('/api/statements/batches');
    if (!res.ok) throw new Error('Falha ao carregar lotes de importação');
    return res.json();
  },

  async deleteBatch(batchId: string, actorUser?: User, force?: boolean): Promise<{ success: boolean; message: string }> {
    const res = await customFetch(`/api/statements/batches/${batchId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUser, force })
    });
    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.error || 'Falha ao excluir lote de extrato');
      (err as any).hasReconciled = json.hasReconciled;
      (err as any).reconciledCount = json.reconciledCount;
      throw err;
    }
    return json;
  },

  async updateTransaction(
    txId: string,
    data: {
      counterparty_name?: string;
      counterparty_doc?: string;
      description?: string;
      memo?: string;
    },
    actorUser?: User
  ): Promise<{ success: boolean; message: string; transaction: Transaction }> {
    const res = await customFetch(`/api/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao atualizar dados da transação');
    return json;
  },

  async deleteTransaction(txId: string, actorUser?: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch(`/api/transactions/${txId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao excluir transação');
    return json;
  },

  async deleteManyTransactions(ids: string[], actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/transactions/delete-many', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao excluir transações');
    return json;
  },

  async ignoreTransaction(txId: string, reason?: string, actorUser?: User): Promise<{ success: boolean; newStatus: string; message: string }> {
    const res = await customFetch(`/api/transactions/${txId}/ignore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao desconsiderar transação');
    return json;
  },

  async markPixReturn(
    txId: string,
    options?: {
      reason?: string;
      isPartial?: boolean;
      returnedAmount?: number;
      action?: 'RESTORE' | 'TOGGLE';
      actorUser?: User;
    }
  ): Promise<{ success: boolean; newStatus?: string; isPixReturn?: number; message: string; isPartial?: boolean; netAmount?: number }> {
    const res = await customFetch(`/api/transactions/${txId}/mark-return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {})
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao processar devolução de Pix');
    return json;
  },

  async linkPixReturn(data: {
    debitTxId: string;
    creditTxId: string;
    returnedAmount?: number;
    reason?: string;
    actorUser?: User;
  }): Promise<{ success: boolean; message: string; isPartial?: boolean; netAmount?: number }> {
    const res = await customFetch('/api/transactions/link-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao vincular devolução de Pix');
    return json;
  },

  async unlinkPixReturn(transactionId: string, actorUser?: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/transactions/unlink-return', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao desvincular devolução de Pix');
    return json;
  },

  async getReturnCandidates(
    debitId: string,
    filters?: {
      q?: string;
      start_date?: string;
      end_date?: string;
      bank?: string;
      status_filter?: string;
      mode?: 'suggested' | 'search';
    }
  ): Promise<{ debitTx: Transaction; candidates: Transaction[]; isSearch?: boolean }> {
    const params = new URLSearchParams();
    if (filters?.q) params.append('q', filters.q);
    if (filters?.start_date) params.append('start_date', filters.start_date);
    if (filters?.end_date) params.append('end_date', filters.end_date);
    if (filters?.bank && filters.bank !== 'ALL') params.append('bank', filters.bank);
    if (filters?.status_filter && filters.status_filter !== 'ALL') params.append('status_filter', filters.status_filter);
    if (filters?.mode) params.append('mode', filters.mode);

    const qs = params.toString();
    const res = await customFetch(`/api/transactions/return-candidates/${debitId}${qs ? `?${qs}` : ''}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao buscar candidatos para devolução');
    return json;
  },

  async cleanDatabase(actorUser?: User, preserveDrivers = true, companyId?: string): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/database/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUser, preserveDrivers, company_id: companyId || globalCompanyId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao limpar banco de dados');
    return json;
  },

  // Transactions
  async getTransactions(filters: Partial<TransactionFilters>): Promise<{
    transactions: Transaction[];
    stats: TransactionStats;
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    };
  }> {
    const query = new URLSearchParams();
    if (filters.company_id) query.append('company_id', filters.company_id);
    if (filters.status) query.append('status', filters.status);
    if (filters.bank) query.append('bank', filters.bank);
    if (filters.driver_id) query.append('driver_id', filters.driver_id);
    if (filters.batch_id) query.append('batch_id', filters.batch_id);
    if (filters.is_pix) query.append('is_pix', '1');
    if (filters.unidentified_payer) query.append('unidentified_payer', '1');
    if (filters.type) query.append('type', filters.type);
    if (filters.search) query.append('search', filters.search);
    if (filters.start_date) query.append('start_date', filters.start_date);
    if (filters.end_date) query.append('end_date', filters.end_date);
    if (filters.min_amount) query.append('min_amount', filters.min_amount);
    if (filters.max_amount) query.append('max_amount', filters.max_amount);
    if (filters.order_by) query.append('order_by', filters.order_by);
    if (filters.page) query.append('page', String(filters.page));
    if (filters.limit) query.append('limit', String(filters.limit));

    const res = await customFetch(`/api/transactions?${query.toString()}`);
    if (!res.ok) throw new Error('Falha ao buscar transações');
    return res.json();
  },

  async lockTransactions(transactionIds: string[], sessionId: string | null, actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/transactions/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_ids: transactionIds, session_id: sessionId, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao bloquear transações.');
    return json;
  },

  async unlockTransactions(transactionIds: string[], actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/transactions/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_ids: transactionIds, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao desbloquear transações.');
    return json;
  },

  // Reconciliation
  async startReconciliationSession(driverId: string, notes: string | undefined, actorUser: User, companyId?: string): Promise<ReconciliationSession> {
    const res = await customFetch('/api/reconciliation/start-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: driverId, notes, actorUser, company_id: companyId || globalCompanyId })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao iniciar sessão de conciliação');
    return json;
  },

  async finishReconciliationSession(data: {
    session_id?: string;
    driver_id: string;
    transaction_ids: string[];
    voucher_numbers?: Record<string, string>;
    general_voucher?: string;
    missing_amount?: number;
    notes?: string;
    actorUser: User;
    company_id?: string;
  }): Promise<{
    success: boolean;
    sessionId: string;
    driverName: string;
    itemCount: number;
    totalAmount: number;
    missingAmount?: number;
  }> {
    const res = await customFetch('/api/reconciliation/finish-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, company_id: data.company_id || globalCompanyId })
    });
    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json.error || 'Falha ao finalizar conciliação');
      (err as any).conflictTx = json.conflictTx;
      throw err;
    }
    return json;
  },

  async reopenTransaction(transactionId: string, reason: string, actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch('/api/reconciliation/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: transactionId, reason, actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao reabrir conciliação');
    return json;
  },

  async getSessions(filters?: {
    driver_id?: string;
    start_date?: string;
    end_date?: string;
    search?: string;
  } | string): Promise<ReconciliationSession[]> {
    const params = new URLSearchParams();
    if (typeof filters === 'string') {
      if (filters !== 'ALL') params.append('driver_id', filters);
    } else if (filters) {
      if (filters.driver_id && filters.driver_id !== 'ALL') params.append('driver_id', filters.driver_id);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      if (filters.search) params.append('search', filters.search);
    }
    const queryString = params.toString();
    const url = queryString ? `/api/reconciliation/sessions?${queryString}` : '/api/reconciliation/sessions';
    const res = await customFetch(url);
    if (!res.ok) throw new Error('Falha ao carregar histórico de conciliações');
    return res.json();
  },

  async getSessionDetails(id: string): Promise<{ session: ReconciliationSession; transactions: Transaction[] }> {
    const res = await customFetch(`/api/reconciliation/sessions/${id}`);
    if (!res.ok) throw new Error('Falha ao carregar detalhes da conciliação');
    return res.json();
  },

  async deleteSession(sessionId: string, actorUser: User): Promise<{ success: boolean; message: string }> {
    const res = await customFetch(`/api/reconciliation/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUser })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Falha ao excluir acerto finalizado');
    return json;
  },

  // Reports
  async getDriverSummaryReport(startDate?: string, endDate?: string, driverId?: string): Promise<any[]> {
    const q = new URLSearchParams();
    if (startDate) q.append('start_date', startDate);
    if (endDate) q.append('end_date', endDate);
    if (driverId && driverId !== 'ALL') q.append('driver_id', driverId);
    const res = await customFetch(`/api/reports/driver-summary?${q.toString()}`);
    if (!res.ok) throw new Error('Falha ao gerar relatório por motorista');
    return res.json();
  },

  async getBankSummaryReport(): Promise<any[]> {
    const res = await customFetch('/api/reports/bank-summary');
    if (!res.ok) throw new Error('Falha ao gerar relatório por banco');
    return res.json();
  },

  async getAuditLogs(filters?: { startDate?: string; endDate?: string; action?: string; search?: string }): Promise<AuditLog[]> {
    const q = new URLSearchParams();
    if (filters?.startDate) q.append('start_date', filters.startDate);
    if (filters?.endDate) q.append('end_date', filters.endDate);
    if (filters?.action && filters.action !== 'ALL') q.append('action', filters.action);
    if (filters?.search) q.append('search', filters.search);
    const res = await customFetch(`/api/reports/audit?${q.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar registros de auditoria');
    return res.json();
  }
};
