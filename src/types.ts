export type UserRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR';

export interface Company {
  id: string; // 'matriz' | 'filial' | string
  name: string;
  code: string; // 'MATRIZ' | 'FILIAL'
  cnpj?: string;
  color?: string;
  is_main: number;
  active: number;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  allowed_companies?: string[]; // e.g. ['matriz', 'filial'] or ['matriz'] or ['filial']
  active: number;
  created_at: string;
}

export interface Driver {
  id: string;
  company_id?: string;
  code: string;
  name: string;
  cpf?: string;
  phone?: string;
  vehicle_plate: string;
  vehicle_model?: string;
  route?: string;
  active: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  total_sessions?: number;
  total_reconciled_pix_count?: number;
  total_reconciled_amount?: number;
  /**
   * Sessão IN_PROGRESS ativa para este motorista (se houver).
   * Preenchido pelo servidor em `GET /api/drivers` para a UI mostrar
   * o aviso "Em uso por X desde HH:MM" no StartSessionModal e bloquear
   * tentativa concorrente.
   */
  active_session?: {
    session_id: string;
    operator_user_id: string;
    operator_user_name: string;
    started_at: string;
  } | null;
}

export interface BankAccount {
  id: string;
  company_id?: string;
  bank_code: string;
  bank_name: string;
  agency?: string;
  account_number?: string;
  color?: string;
  active: number;
}

export interface ImportBatch {
  id: string;
  company_id?: string;
  filename: string;
  bank_name: string;
  bank_code?: string;
  format: 'OFX' | 'CSV';
  total_transactions: number;
  total_credit: number;
  total_debit: number;
  period_start?: string;
  period_end?: string;
  imported_by_user_id: string;
  imported_by_user_name: string;
  imported_at: string;
  current_transaction_count?: number;
  reconciled_count?: number;
  pending_count?: number;
}

export interface Transaction {
  id: string;
  company_id?: string;
  import_batch_id?: string;
  bank_name: string;
  bank_code?: string;
  fitid?: string;
  date: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  original_amount?: number;
  returned_amount?: number;
  description: string;
  memo?: string;
  document_number?: string;
  is_pix: number | boolean;
  is_pix_return?: number | boolean;
  return_reason?: string;
  status: 'PENDING' | 'RECONCILED' | 'IGNORED' | 'RETURNED';
  reconciled_at?: string;
  reconciled_by_user_id?: string;
  reconciled_by_user_name?: string;
  driver_id?: string;
  driver_name?: string;
  driver_plate?: string;
  session_id?: string;
  voucher_number?: string;
  notes?: string;
  counterparty_name?: string;
  counterparty_doc?: string;
  linked_tx_id?: string;
  raw_data?: string;
  created_at: string;
  locked_at?: string;
  locked_by_user_id?: string;
  locked_by_user_name?: string;
  locked_by_session_id?: string;
}

export interface ReconciliationSession {
  id: string;
  company_id?: string;
  driver_id: string;
  driver_name: string;
  driver_plate?: string;
  operator_user_id: string;
  operator_user_name: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  started_at: string;
  completed_at?: string;
  total_items: number;
  total_amount: number;
  missing_amount?: number;
  notes?: string;
}

export interface AuditLog {
  id: string;
  company_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  user_id: string;
  user_name: string;
  user_role: string;
  details_json?: string;
  created_at: string;
}

export interface TransactionStats {
  total_count?: number;
  total_sum?: number;
  pending_count?: number;
  pending_sum?: number;
  reconciled_count?: number;
  reconciled_sum?: number;
  pix_count?: number;
  pix_sum?: number;
  returned_count?: number;
  returned_sum?: number;
  ignored_count?: number;
  ignored_sum?: number;
  unidentified_payer_count?: number;
}

export interface TransactionFilters {
  company_id?: string;
  status: 'ALL' | 'PENDING' | 'RECONCILED' | 'RETURNED' | 'IGNORED';
  bank: string;
  driver_id: string;
  batch_id?: string;
  is_pix: boolean;
  unidentified_payer?: boolean;
  type: 'ALL' | 'CREDIT' | 'DEBIT' | 'DEBIT_RETURN';
  search: string;
  start_date: string;
  end_date: string;
  min_amount?: string;
  max_amount?: string;
  order_by?: 'DATE_DESC' | 'DATE_ASC' | 'AMOUNT_DESC' | 'AMOUNT_ASC';
  page: number;
  limit: number;
}
