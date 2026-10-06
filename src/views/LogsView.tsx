import React, { useState, useEffect } from 'react';
import { api, formatDateTime } from '../services/api';
import { AuditLog } from '../types';
import { useCompany } from '../context/CompanyContext';
import { ShieldCheck, Search, X, RotateCcw, Activity, AlertTriangle, CheckCircle2, User, Terminal, ArrowRight } from 'lucide-react';
import { LicensePlateBadge } from '../components/LicensePlateBadge';
import { formatCurrency } from '../services/api';

export const LogsView: React.FC = () => {
  const { currentCompany } = useCompany();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [auditStartDate, setAuditStartDate] = useState<string>('');
  const [auditEndDate, setAuditEndDate] = useState<string>('');

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await api.getAuditLogs({
        startDate: auditStartDate,
        endDate: auditEndDate,
        action: auditActionFilter,
        search: auditSearch
      });
      setAuditLogs(data);
    } catch (err) {
      console.error('Error loading logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [auditActionFilter, auditStartDate, auditEndDate, auditSearch, currentCompany?.id]);

  const renderLogIcon = (action?: string) => {
    if (!action) return <Activity className="w-4 h-4 text-blue-500" />;
    if (action.includes('ERROR') || action.includes('FAILED')) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (action.includes('DELETED') || action.includes('REMOVED')) return <X className="w-4 h-4 text-red-500" />;
    if (action.includes('COMPLETED') || action.includes('SUCCESS') || action.includes('RESTORE')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (action.includes('SYSTEM')) return <Terminal className="w-4 h-4 text-indigo-500" />;
    return <Activity className="w-4 h-4 text-blue-500" />;
  };

  const translateAction = (action?: string) => {
    if (!action) return 'Desconhecido';
    const map: Record<string, string> = {
      'RECONCILIATION_COMPLETED': 'Acerto Finalizado',
      'RECONCILIATION_REOPENED': 'Acerto Reaberto',
      'SESSION_DELETED': 'Acerto Excluído',
      'SESSION_STARTED': 'Acerto Iniciado',
      'TRANSACTION_IGNORED': 'Pix Desconsiderado',
      'PIX_RETURNED': 'Pix Devolvido',
      'BACKUP_RESTORE': 'Restauração de Backup',
      'SYSTEM_ERROR': 'Erro de Sistema',
      'USER_LOGIN': 'Login de Usuário',
      'USER_UPDATED': 'Usuário Atualizado',
      'USER_CREATED': 'Usuário Criado',
      'USER_DELETED': 'Usuário Excluído',
      'DRIVER_CREATED': 'Motorista Cadastrado',
      'DRIVER_UPDATED': 'Motorista Atualizado',
      'DRIVER_DELETED': 'Motorista Excluído',
      'STATEMENT_DELETED': 'Extrato Excluído',
      'TRANSACTION_DELETED': 'Transação Excluída',
      'TRANSACTION_CREATED': 'Transação Cadastrada',
      'TRANSACTION_MANUALLY_EDITED': 'Edição Manual de Lançamento',
    };
    return map[action] || action.replace(/_/g, ' ');
  };

  const translateRole = (role?: string) => {
    if (!role) return '';
    if (role === 'ADMIN') return 'Administrador';
    if (role === 'OPERATOR') return 'Operador';
    return role;
  };

  const translateKey = (key: string) => {
    const k = key.toUpperCase();
    const map: Record<string, string> = {
      'REASON': 'Motivo',
      'STATUS': 'Status',
      'NAME': 'Nome',
      'DRIVERCODE': 'Código',
      'VEHICLE_PLATE': 'Placa',
      'FILENAME': 'Arquivo',
      'BANKNAME': 'Banco',
      'TOTALTRANSACTIONS': 'Qtd. Lançamentos',
      'DESCRIPTION': 'Descrição',
      'AMOUNT': 'Valor',
      'DATE': 'Data',
      'BANK': 'Banco',
    };
    return map[k] || key;
  };

  const translateValue = (val: any) => {
    if (val === 'IN_PROGRESS') return 'Em Andamento';
    if (val === 'COMPLETED') return 'Concluído';
    if (val === 'PENDING') return 'Pendente';
    if (val === 'RECONCILED') return 'Conciliado';
    if (val === 'IGNORED') return 'Ignorado';
    return String(val);
  };

  const renderDetails = (log: AuditLog, parsed: any) => {
    if (!parsed) {
      return (
        <div className="font-mono text-[10px] text-slate-600 bg-slate-50 border border-slate-100 p-2 rounded max-w-xl break-all">
          {log.details_json || '-'}
        </div>
      );
    }

    const isReconciliation = log.action === 'RECONCILIATION_COMPLETED' || log.action === 'SESSION_DELETED' || log.action === 'SESSION_STARTED';
    
    if (isReconciliation && parsed.driver) {
      const hasMissing = typeof parsed.missingAmount === 'number' && parsed.missingAmount > 0;
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">
            {parsed.driver}
          </span>
          {parsed.plate && (
            <span className="flex items-center gap-2">
              <LicensePlateBadge plate={parsed.plate} />
            </span>
          )}
          {typeof parsed.totalAmount === 'number' && (
            <span className="text-slate-600 font-medium ml-2">
              Pix: <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{formatCurrency(parsed.totalAmount)}</span> 
              {parsed.itemCount !== undefined && <span className="text-[10px] text-slate-400"> ({parsed.itemCount} itens)</span>}
            </span>
          )}
          {hasMissing && (
            <span className="inline-flex items-center gap-1 font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[10px] shadow-sm ml-2">
              <AlertTriangle className="w-3 h-3 text-red-600" />
              Falta: {formatCurrency(parsed.missingAmount)}
            </span>
          )}
        </div>
      );
    }

    if (log.action === 'USER_UPDATED' || log.action === 'USER_CREATED') {
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {parsed.newName && <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700"><b>Nome:</b> {parsed.newName}</span>}
          {parsed.newEmail && <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700"><b>E-mail:</b> {parsed.newEmail}</span>}
          {parsed.newRole && <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700"><b>Perfil:</b> {translateRole(parsed.newRole)}</span>}
          {parsed.newActive !== undefined && <span className={`border px-1.5 py-0.5 rounded ${parsed.newActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}><b>Status:</b> {parsed.newActive ? 'Ativo' : 'Inativo'}</span>}
        </div>
      );
    }

    if (log.action === 'USER_LOGIN') {
      return (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {parsed.ip && <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-mono"><b>IP:</b> {parsed.ip}</span>}
        </div>
      );
    }

    if (log.action === 'TRANSACTION_MANUALLY_EDITED' && parsed.previous && parsed.updated) {
      const diffs: React.ReactNode[] = [];
      Object.keys(parsed.updated).forEach(key => {
        const oldVal = parsed.previous[key];
        const newVal = parsed.updated[key];
        if (oldVal !== newVal && key !== 'updated_at' && key !== 'id') {
          diffs.push(
            <div key={key} className="bg-white shadow-sm border border-slate-200 px-2 py-1 rounded-md text-slate-600 flex items-center gap-1.5">
              <span className="font-bold text-[9px] uppercase text-slate-500">{translateKey(key)}:</span>
              <span className="line-through opacity-60 text-red-600 truncate max-w-[150px]" title={String(oldVal)}>{translateValue(oldVal)}</span>
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-emerald-700 font-medium truncate max-w-[150px]" title={String(newVal)}>{translateValue(newVal)}</span>
            </div>
          );
        }
      });
      return diffs.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-[10px]">{diffs}</div>
      ) : (
        <span className="text-[10px] text-slate-500 italic">Sem alterações visíveis</span>
      );
    }

    // Default JSON fallback mapped to badges
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {Object.entries(parsed).map(([key, val]) => (
          <span key={key} className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 max-w-xs truncate" title={typeof val === 'object' ? JSON.stringify(val) : String(val)}>
            <b className="text-slate-500 uppercase text-[9px] mr-1">{translateKey(key)}:</b> {typeof val === 'object' ? JSON.stringify(val) : translateValue(val)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none"></div>
      
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 relative">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600 shadow-sm border border-indigo-200">
                <ShieldCheck className="w-7 h-7" />
              </div>
              Logs do Sistema
            </h1>
            <p className="mt-2 text-sm text-slate-600 font-medium max-w-2xl">
              Acompanhe todas as atividades, erros e modificações sensíveis no sistema. Exclusivo para administradores.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 rounded-2xl p-5 shadow-xl shadow-slate-200/40 mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h4 className="font-extrabold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" /> Filtros de Auditoria
            </h4>
            {(auditActionFilter !== 'ALL' || auditStartDate !== '' || auditEndDate !== '' || auditSearch !== '') && (
              <button
                onClick={() => {
                  setAuditActionFilter('ALL');
                  setAuditStartDate('');
                  setAuditEndDate('');
                  setAuditSearch('');
                }}
                className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Ação / Evento:</label>
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:bg-white"
              >
                <option value="ALL">Todos os Eventos</option>
                <option value="RECONCILIATION_COMPLETED">Acertos Finalizados</option>
                <option value="RECONCILIATION_REOPENED">Acertos Reabertos</option>
                <option value="SESSION_DELETED">Acertos Excluídos</option>
                <option value="TRANSACTION_IGNORED">Transações Desconsideradas</option>
                <option value="PIX_RETURNED">Devoluções / Estornos de Pix</option>
                <option value="BACKUP_RESTORE">Restaurações de Banco de Dados</option>
                <option value="SYSTEM_ERROR">Erros de Sistema</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Data Inicial:</label>
              <input
                type="date"
                value={auditStartDate}
                onChange={(e) => setAuditStartDate(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Data Final:</label>
              <input
                type="date"
                value={auditEndDate}
                onChange={(e) => setAuditEndDate(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1.5">Buscar:</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Nome, placa, ID ou detalhes..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all hover:bg-white"
                />
                {auditSearch && (
                  <button
                    onClick={() => setAuditSearch('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" /> Registros ({auditLogs.length})
            </span>
            {loading && <span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5 animate-pulse"><div className="w-2 h-2 rounded-full bg-indigo-500"></div> Carregando...</span>}
          </div>
          
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-50/80 text-slate-500 uppercase font-extrabold text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="py-3 px-4 border-b border-slate-200/70 rounded-tl-xl whitespace-nowrap">Data / Hora</th>
                  <th className="py-3 px-4 border-b border-slate-200/70 whitespace-nowrap">Ação</th>
                  <th className="py-3 px-4 border-b border-slate-200/70 whitespace-nowrap">Usuário</th>
                  <th className="py-3 px-4 border-b border-slate-200/70 rounded-tr-xl">Detalhes Técnicos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center">
                        <ShieldCheck className="w-10 h-10 text-slate-300 mb-3" />
                        <span className="text-sm font-semibold">Nenhum log encontrado.</span>
                        <span className="text-xs text-slate-400 mt-1">Tente ajustar os filtros acima.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => {
                    let parsed: any = null;
                    try {
                      if (log.details_json) {
                        parsed = JSON.parse(log.details_json);
                      }
                    } catch (e) {
                      // ignore
                    }

                    const isReconciliation = log.action === 'RECONCILIATION_COMPLETED' || log.action === 'SESSION_DELETED';
                    const hasMissing = parsed && typeof parsed.missingAmount === 'number' && parsed.missingAmount > 0;

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 font-bold text-[10px] text-slate-700 uppercase tracking-wide">
                            {renderLogIcon(log.action)}
                            {translateAction(log.action)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="bg-slate-100 p-1.5 rounded-full border border-slate-200 group-hover:border-indigo-300 group-hover:bg-indigo-50 transition-colors">
                              <User className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600" />
                            </div>
                            <div>
                              <span className="block font-bold text-slate-700">{log.user_name}</span>
                              <span className="block text-[10px] text-slate-400 uppercase tracking-wide">{translateRole(log.user_role)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {renderDetails(log, parsed)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
