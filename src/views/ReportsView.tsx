import React, { useState, useEffect } from 'react';
import { api, formatCurrency, formatDate, formatDateTime, formatPlate } from '../services/api';
import { AuditLog } from '../types';
import { useCompany } from '../context/CompanyContext';
import {
  BarChart3,
  Truck,
  Building2,
  Store,
  ShieldCheck,
  Calendar,
  Download,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { currentCompany } = useCompany();
  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';
  const [activeReportTab, setActiveReportTab] = useState<'driver' | 'bank' | 'audit'>('driver');
  const [driverSummary, setDriverSummary] = useState<any[]>([]);
  const [bankSummary, setBankSummary] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      if (activeReportTab === 'driver') {
        const data = await api.getDriverSummaryReport(startDate, endDate);
        setDriverSummary(data);
      } else if (activeReportTab === 'bank') {
        const data = await api.getBankSummaryReport();
        setBankSummary(data);
      } else if (activeReportTab === 'audit') {
        const data = await api.getAuditLogs();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeReportTab, startDate, endDate, currentCompany?.id]);

  const exportDriverSummaryCsv = () => {
    if (!driverSummary || driverSummary.length === 0) return;
    const headers = ['Código', 'Motorista', 'Placa', 'Rota', 'Qtd Pix', 'Total Conciliado (R$)', 'Sessões'];
    const rows = driverSummary.map((d) => [
      d.driver_code,
      `"${d.driver_name}"`,
      d.vehicle_plate,
      `"${d.route || ''}"`,
      d.total_pix_reconciled,
      d.total_amount_reconciled.toFixed(2),
      d.total_sessions
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Conciliacao_Motoristas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBankSummaryCsv = () => {
    if (!bankSummary || bankSummary.length === 0) return;
    const headers = ['Banco', 'Total Lançamentos', 'Volume Total (R$)', 'Qtd Conciliado', 'Total Conciliado (R$)', 'Qtd Pendente', 'Total Pendente (R$)'];
    const rows = bankSummary.map((b) => [
      `"${b.bank_name}"`,
      b.total_transactions,
      b.total_volume.toFixed(2),
      b.reconciled_count,
      b.reconciled_sum.toFixed(2),
      b.pending_count,
      b.pending_sum.toFixed(2)
    ]);

    const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Conciliacao_Bancos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Tab Switcher & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
          <button
            onClick={() => setActiveReportTab('driver')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeReportTab === 'driver'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Relatório por Motorista</span>
          </button>

          <button
            onClick={() => setActiveReportTab('bank')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeReportTab === 'bank'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Relatório por Banco</span>
          </button>

          <button
            onClick={() => setActiveReportTab('audit')}
            className={`px-3 py-2 rounded-lg font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeReportTab === 'audit'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Trilha de Auditoria</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {activeReportTab === 'driver' && (
            <button
              onClick={exportDriverSummaryCsv}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Exportar CSV</span>
            </button>
          )}

          {activeReportTab === 'bank' && (
            <button
              onClick={exportBankSummaryCsv}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Exportar CSV</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Driver Summary Report */}
      {activeReportTab === 'driver' && (
        <div className="space-y-4">
          {/* Period Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <span className="font-bold text-slate-700">Filtrar por Período:</span>
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                />
                <span className="text-slate-400">até</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Limpar datas
                </button>
              )}
            </div>

            <p className="text-slate-500">
              Total de motoristas com acertos: <strong>{driverSummary.length}</strong>
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm font-semibold text-slate-600">Consolidando dados por motorista...</p>
              </div>
            ) : driverSummary.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Truck className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  Nenhuma conciliação encontrada para o período selecionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-800">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Código</th>
                      <th className="py-3.5 px-4">Nome do Motorista</th>
                      <th className="py-3.5 px-4">Placa do Veículo</th>
                      <th className="py-3.5 px-4">Rota Atendida</th>
                      <th className="py-3.5 px-4 text-center">Qtd. Pix Conferidos</th>
                      <th className="py-3.5 px-4 text-center">Sessões Realizadas</th>
                      <th className="py-3.5 px-4 text-right">Valor Total Conciliado</th>
                      <th className="py-3.5 px-4">Período de Recebimentos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {driverSummary.map((d) => (
                      <tr key={d.driver_id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-extrabold text-blue-700">
                          {d.driver_code}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {d.driver_name}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                          {formatPlate(d.vehicle_plate)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">{d.route || '-'}</td>
                        <td className="py-3.5 px-4 text-center font-bold">
                          <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 font-extrabold">
                            {d.total_pix_reconciled}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-slate-700 font-semibold">
                          {d.total_sessions}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-600 text-sm whitespace-nowrap">
                          {formatCurrency(d.total_amount_reconciled)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatDate(d.first_receipt_date)} até {formatDate(d.last_receipt_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bank Summary Report */}
      {activeReportTab === 'bank' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm font-semibold text-slate-600">
                Consolidando movimentação por instituição financeira...
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-800">
                <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Instituição Bancária</th>
                    <th className="py-3.5 px-4 text-center">Total Lançamentos</th>
                    <th className="py-3.5 px-4 text-right">Volume Total</th>
                    <th className="py-3.5 px-4 text-right text-emerald-700">Conciliado (R$)</th>
                    <th className="py-3.5 px-4 text-right text-amber-700">Pendente (R$)</th>
                    <th className="py-3.5 px-4 text-center">Taxa Conciliação</th>
                    <th className="py-3.5 px-4 text-right text-blue-700">Volume Pix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bankSummary.map((b, idx) => {
                    const rate =
                      b.total_volume > 0
                        ? Math.round((b.reconciled_sum / b.total_volume) * 100)
                        : 0;

                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span>{b.bank_name}</span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono">{b.total_transactions}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(b.total_volume)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-600">
                          {formatCurrency(b.reconciled_sum)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-amber-600">
                          {formatCurrency(b.pending_sum)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                              <div
                                className="bg-blue-600 h-full rounded-full"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className="font-extrabold text-slate-800">{rate}%</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-extrabold text-blue-600">
                          {formatCurrency(b.pix_sum)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail */}
      {activeReportTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span className="flex items-center space-x-1.5 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Registro de Eventos, Conciliações e Alterações de Permissões</span>
            </span>
            <span>Últimos 200 eventos registrados</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-3.5 px-4">Data / Hora</th>
                  <th className="py-3.5 px-4">Ação Registrada</th>
                  <th className="py-3.5 px-4">Usuário Responsável</th>
                  <th className="py-3.5 px-4">Perfil</th>
                  <th className="py-3.5 px-4">Detalhes Técnicos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded text-[10px] border border-blue-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans font-bold text-slate-900 whitespace-nowrap">
                      {log.user_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-[10px] text-slate-500 font-bold">{log.user_role}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px] truncate max-w-md">
                      {log.details_json}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
