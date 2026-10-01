import { pgTable, serial, text, timestamp, integer, boolean, real } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').unique().notNull(),
  cnpj: text('cnpj'),
  color: text('color').default('#2563eb'),
  is_main: integer('is_main').default(0),
  active: integer('active').default(1),
  created_at: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  uid: text('uid').unique(), // Firebase UID
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  role: text('role').notNull(), // ADMIN, OPERATOR, AUDITOR
  pin: text('pin').default('1234'),
  avatar: text('avatar'),
  allowed_companies: text('allowed_companies').default('["matriz","filial"]'),
  active: integer('active').default(1),
  created_at: timestamp('created_at').defaultNow(),
});

export const drivers = pgTable('drivers', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  cpf: text('cpf'),
  phone: text('phone'),
  vehicle_plate: text('vehicle_plate').notNull(),
  vehicle_model: text('vehicle_model'),
  route: text('route'),
  active: integer('active').default(1),
  notes: text('notes'),
  total_sessions: integer('total_sessions').default(0),
  total_amount_reconciled: real('total_amount_reconciled').default(0),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  import_batch_id: text('import_batch_id'),
  bank_name: text('bank_name').notNull(),
  bank_code: text('bank_code'),
  fitid: text('fitid'),
  date: timestamp('date').notNull(),
  type: text('type').notNull(), // CREDIT, DEBIT
  amount: real('amount').notNull(),
  original_amount: real('original_amount'),
  returned_amount: real('returned_amount').default(0),
  description: text('description').notNull(),
  memo: text('memo'),
  document_number: text('document_number'),
  is_pix: boolean('is_pix').default(false),
  is_pix_return: boolean('is_pix_return').default(false),
  return_reason: text('return_reason'),
  linked_tx_id: text('linked_tx_id'),
  status: text('status').default('PENDING'), // PENDING, RECONCILED, IGNORED, RETURNED
  driver_id: text('driver_id'),
  driver_name: text('driver_name'),
  driver_plate: text('driver_plate'),
  session_id: text('session_id'),
  voucher_number: text('voucher_number'),
  notes: text('notes'),
  locked_at: timestamp('locked_at'),
  counterparty_name: text('counterparty_name'),
  counterparty_doc: text('counterparty_doc'),
  raw_data: text('raw_data'),
  reconciled_at: timestamp('reconciled_at'),
  reconciled_by_user_id: text('reconciled_by_user_id'),
  reconciled_by_user_name: text('reconciled_by_user_name'),
  created_at: timestamp('created_at').defaultNow(),
});

export const reconciliation_sessions = pgTable('reconciliation_sessions', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  driver_id: text('driver_id').notNull(),
  driver_name: text('driver_name').notNull(),
  driver_plate: text('driver_plate').notNull(),
  operator_user_id: text('operator_user_id').notNull(),
  operator_user_name: text('operator_user_name').notNull(),
  status: text('status').default('IN_PROGRESS'),
  started_at: timestamp('started_at').defaultNow(),
  completed_at: timestamp('completed_at'),
  total_items: integer('total_items').default(0),
  total_amount: real('total_amount').default(0),
  missing_amount: real('missing_amount').default(0),
  general_voucher: text('general_voucher'),
  notes: text('notes'),
});

export const import_batches = pgTable('import_batches', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  filename: text('filename').notNull(),
  bank_name: text('bank_name').notNull(),
  bank_code: text('bank_code'),
  format: text('format').notNull(),
  total_transactions: integer('total_transactions').default(0),
  total_credit: real('total_credit').default(0),
  total_debit: real('total_debit').default(0),
  period_start: timestamp('period_start'),
  period_end: timestamp('period_end'),
  imported_by_user_id: text('imported_by_user_id').notNull(),
  imported_by_user_name: text('imported_by_user_name').notNull(),
  imported_at: timestamp('imported_at').defaultNow(),
});

export const bank_accounts = pgTable('bank_accounts', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  bank_code: text('bank_code').notNull(),
  bank_name: text('bank_name').notNull(),
  agency: text('agency'),
  account_number: text('account_number'),
  color: text('color').default('#0284c7'),
  active: integer('active').default(1),
});

export const system_snapshots = pgTable('system_snapshots', {
  key: text('key').primaryKey(),
  data: text('data').notNull(),
  updated_at: timestamp('updated_at').defaultNow(),
});

export const audit_logs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  company_id: text('company_id').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id').notNull(),
  user_id: text('user_id').notNull(),
  user_name: text('user_name').notNull(),
  user_role: text('user_role').notNull(),
  details_json: text('details_json').default('{}'),
  created_at: timestamp('created_at').defaultNow(),
});
