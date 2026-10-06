import React, { useState, useEffect, useCallback } from 'react';
import { api, formatCurrency, formatDate, formatDateTime, formatPlate } from '../services/api';
import { LicensePlateBadge } from '../components/LicensePlateBadge';
import { AuditLog, Driver, ReconciliationSession } from '../types';
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
  AlertTriangle,
  RotateCcw,
  Eye,
  X,
  ChevronRight,
  FileText,
  DollarSign,
  Layers,
  ArrowRight
} from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { currentCompany, loading: companyLoading } = useCompany();
  const [activeReportTab, setActiveReportTab] = useState<'driver' | 'bank' | 'audit'>('driver');
  const [driverSummary, setDriverSummary] = useState<any[]>([]);
  const [bankSummary, setBankSummary] = useState<any[]>([]);
  const [driversList, setDriversList] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Driver Report Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('ALL');
  const [driverSearch, setDriverSearch] = useState<string>('');

  // Driver Sessions Drilldown Modal
  const [inspectingDriver, setInspectingDriver] = useState<any | null>(null);
  const [driverSessions, setDriverSessions] = useState<ReconciliationSession[]>([]);
  const [loadingDriverSessions, setLoadingDriverSessions] = useState(false);



  // Fetch aux drivers for dropdown
  useEffect(() => {
    api.getDrivers()
      .then((data) => setDriversList(data))
      .catch((err) => console.error('Failed to load drivers for filter:', err));
  }, [currentCompany?.id]);

  const loadData = useCallback(async () => {
    // Don't load while company context is still initializing
    if (companyLoading) return;
    try {
      setLoading(true);
      setLoadError(null);
      if (activeReportTab === 'driver') {
        const data = await api.getDriverSummaryReport(startDate, endDate, selectedDriverId);
        setDriverSummary(Array.isArray(data) ? data : []);
      } else if (activeReportTab === 'bank') {
        const data = await api.getBankSummaryReport();
        setBankSummary(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      console.error('Error loading reports:', err);
      setLoadError(err?.message || 'Erro ao carregar relatório. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [
    activeReportTab,
    startDate,
    endDate,
    selectedDriverId,
    currentCompany?.id,
    companyLoading
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Date Quick Presets for Driver Report
  const setDatePreset = (preset: 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'clear') => {
    const today = new Date();
    const formatDateStr = (d: Date) => d.toISOString().slice(0, 10);

    if (preset === 'today') {
      const str = formatDateStr(today);
      setStartDate(str);
      setEndDate(str);
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const str = formatDateStr(y);
      setStartDate(str);
      setEndDate(str);
    } else if (preset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(formatDateStr(d));
      setEndDate(formatDateStr(today));
    } else if (preset === 'last30') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(formatDateStr(d));
      setEndDate(formatDateStr(today));
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(formatDateStr(firstDay));
      setEndDate(formatDateStr(today));
    } else if (preset === 'clear') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleOpenDriverSessions = async (driverSummaryItem: any) => {
    try {
      setInspectingDriver(driverSummaryItem);
      setLoadingDriverSessions(true);
      const sessions = await api.getSessions({
        driver_id: driverSummaryItem.driver_id,
        start_date: startDate,
        end_date: endDate
      });
      setDriverSessions(sessions);
    } catch (err) {
      console.error('Error loading driver sessions:', err);
    } finally {
      setLoadingDriverSessions(false);
    }
  };

  // Filtered driver summary in UI
  const filteredDriverSummary = driverSummary.filter((d) => {
    if (!driverSearch.trim()) return true;
    const term = driverSearch.toLowerCase().trim();
    return (
      d.driver_name?.toLowerCase().includes(term) ||
      d.driver_code?.toLowerCase().includes(term) ||
      d.vehicle_plate?.toLowerCase().includes(term) ||
      d.route?.toLowerCase().includes(term)
    );
  });

  // Calculate totals for Driver Report
  const totalReconciled = filteredDriverSummary.reduce((acc, d) => acc + (d.total_amount_reconciled || 0), 0);
  const totalMissing = filteredDriverSummary.reduce((acc, d) => acc + (d.total_missing_amount || 0), 0);
  const totalExpected = totalReconciled + totalMissing;
  const totalPixCount = filteredDriverSummary.reduce((acc, d) => acc + (d.total_pix_reconciled || 0), 0);
  const driversWithMissingCount = filteredDriverSummary.filter((d) => (d.total_missing_amount || 0) > 0).length;

  const hasDriverFilters = startDate !== '' || endDate !== '' || selectedDriverId !== 'ALL' || driverSearch !== '';

  const exportDriverSummaryCsv = () => {
    if (!filteredDriverSummary || filteredDriverSummary.length === 0) return;
    const headers = [
      'Código',
      'Motorista',
      'Placa',
      'Rota',
      'Qtd Pix',
      'Acertos Realizados',
      'Total Pix Conciliado (R$)',
      'Valor Faltante (R$)',
      'Total Prestação (R$)',
      'Primeiro Recebimento',
      'Último Recebimento'
    ];
    const rows = filteredDriverSummary.map((d) => [
      d.driver_code,
      `"${d.driver_name}"`,
      d.vehicle_plate,
      `"${d.route || ''}"`,
      d.total_pix_reconciled,
      d.total_sessions || 0,
      (d.total_amount_reconciled || 0).toFixed(2),
      (d.total_missing_amount || 0).toFixed(2),
      ((d.total_amount_reconciled || 0) + (d.total_missing_amount || 0)).toFixed(2),
      d.first_receipt_date || '',
      d.last_receipt_date || ''
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
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
    const headers = [
      'Banco',
      'Total Lançamentos',
      'Volume Total (R$)',
      'Qtd Conciliado',
      'Total Conciliado (R$)',
      'Qtd Pendente',
      'Total Pendente (R$)'
    ];
    const rows = bankSummary.map((b) => [
      `"${b.bank_name}"`,
      b.total_transactions,
      b.total_volume.toFixed(2),
      b.reconciled_count,
      b.reconciled_sum.toFixed(2),
      b.pending_count,
      b.pending_sum.toFixed(2)
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
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
            className={`px-3.5 py-2 rounded-lg font-bold flex items-center space-x-2 transition-all cursor-pointer ${
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
            className={`px-3.5 py-2 rounded-lg font-bold flex items-center space-x-2 transition-all cursor-pointer ${
              activeReportTab === 'bank'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Relatório por Banco</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {activeReportTab === 'driver' && (
            <button
              onClick={exportDriverSummaryCsv}
              disabled={filteredDriverSummary.length === 0}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Exportar CSV</span>
            </button>
          )}

          {activeReportTab === 'bank' && (
            <button
              onClick={exportBankSummaryCsv}
              disabled={bankSummary.length === 0}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
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

      {/* ======================================================== */}
      {/* 1. RELATÓRIO POR MOTORISTA & PRESTAÇÃO DE CONTAS          */}
      {/* ======================================================== */}
      {activeReportTab === 'driver' && (
        <div className="space-y-4">
          {/* Summary Metric Cards for the Selected Period */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold">Motoristas no Período</p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {filteredDriverSummary.length}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {totalPixCount} comprovantes Pix vinculados
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                <Truck className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold">Total Pix Conferido</p>
                <p className="text-2xl font-extrabold text-emerald-600 mt-1">
                  {formatCurrency(totalReconciled)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Recebimentos aprovados
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>

            {/* DESTAQUE: VALOR GERAL FALTANTE NA PRESTAÇÃO DE CONTAS */}
            <div
              className={`border rounded-2xl p-4 shadow-xs flex items-center justify-between ${
                totalMissing > 0
                  ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/20'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center space-x-1.5">
                  <p className="text-xs text-slate-600 font-bold">Valor Geral Faltante</p>
                  {totalMissing > 0 && (
                    <span className="bg-red-100 text-red-700 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full border border-red-200">
                      Débito
                    </span>
                  )}
                </div>
                <p
                  className={`text-2xl font-extrabold mt-1 ${
                    totalMissing > 0 ? 'text-red-600' : 'text-slate-800'
                  }`}
                >
                  {formatCurrency(totalMissing)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {driversWithMissingCount > 0
                    ? `${driversWithMissingCount} motorista(s) com falta de prestação`
                    : 'Sem diferenças pendentes no período'}
                </p>
              </div>
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
                  totalMissing > 0
                    ? 'bg-red-100 text-red-600 border-red-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200'
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold">Total Prestação Esperada</p>
                <p className="text-2xl font-extrabold text-blue-900 mt-1">
                  {formatCurrency(totalExpected)}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Pix Conferido + Valor Faltante
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Filter Panel */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-blue-600" />
                <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">
                  Filtros do Relatório de Motoristas
                </h4>
              </div>

              {hasDriverFilters && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setSelectedDriverId('ALL');
                    setDriverSearch('');
                  }}
                  className="inline-flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Limpar Filtros</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Motorista Específico:
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                >
                  <option value="ALL">Todos os Motoristas</option>
                  {driversList.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({formatPlate(d.vehicle_plate)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Data Inicial:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Data Final:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Buscar Nome / Placa / Rota:
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar nesta lista..."
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  {driverSearch && (
                    <button
                      onClick={() => setDriverSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
              <span className="text-slate-500 font-bold mr-1">Atalhos de Período:</span>
              <button
                type="button"
                onClick={() => setDatePreset('today')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200/80"
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('yesterday')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200/80"
              >
                Ontem
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('last7')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200/80"
              >
                Últimos 7 dias
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('last30')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200/80"
              >
                Últimos 30 dias
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('thisMonth')}
                className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer border border-slate-200/80"
              >
                Este Mês
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => setDatePreset('clear')}
                  className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-bold transition-colors cursor-pointer border border-red-200"
                >
                  Limpar Datas
                </button>
              )}
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {loading || companyLoading ? (
              <div className="p-12 text-center text-slate-400">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm font-semibold text-slate-600">
                  Consolidando dados e apurando valores faltantes por motorista...
                </p>
              </div>
            ) : loadError ? (
              <div className="p-12 text-center text-red-500 space-y-3">
                <AlertTriangle className="w-10 h-10 mx-auto" />
                <p className="text-sm font-bold">{loadError}</p>
                <button
                  onClick={loadData}
                  className="mt-2 inline-flex items-center space-x-1 bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Tentar Novamente
                </button>
              </div>
            ) : filteredDriverSummary.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-2">
                <Truck className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">
                  Nenhuma conciliação encontrada para os filtros selecionados.
                </p>
                <button
                  onClick={loadData}
                  className="mt-2 inline-flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Recarregar
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-800">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-2">Código</th>
                      <th className="py-3.5 px-2">Nome do Motorista</th>
                      <th className="py-3.5 px-2">Placa</th>
                      <th className="py-3.5 px-2">Rota</th>
                      <th className="py-3.5 px-2 text-center">Pix Conferidos</th>
                      <th className="py-3.5 px-2 text-center">Acertos</th>
                      <th className="py-3.5 px-2 text-right">Pix Conciliado (R$)</th>
                      <th className="py-3.5 px-2 text-right text-red-700 font-extrabold">
                        Valor Faltante (R$)
                      </th>
                      <th className="py-3.5 px-2 text-right text-slate-900 font-extrabold">
                        Total Prestação (R$)
                      </th>
                      <th className="py-3.5 px-2">Período de Recebimentos</th>
                      <th className="py-3.5 px-2 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDriverSummary.map((d) => {
                      const hasMissing = (d.total_missing_amount || 0) > 0;
                      const expectedSum = (d.total_amount_reconciled || 0) + (d.total_missing_amount || 0);

                      return (
                        <tr
                          key={d.driver_id}
                          className={`hover:bg-slate-50 transition-colors ${
                            hasMissing ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          <td className="py-3.5 px-2 font-mono font-extrabold text-blue-700">
                            {d.driver_code}
                          </td>
                          <td className="py-3.5 px-2 font-bold text-slate-900 whitespace-nowrap">
                            {d.driver_name}
                          </td>
                          <td className="py-3.5 px-2 whitespace-nowrap">
                            <LicensePlateBadge plate={d.vehicle_plate} />
                          </td>
                          <td className="py-3.5 px-2 text-slate-600">{d.route || '-'}</td>
                          <td className="py-3.5 px-2 text-center font-bold">
                            <span className="bg-blue-50 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200 font-extrabold">
                              {d.total_pix_reconciled}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-center text-slate-700 font-semibold">
                            {d.total_sessions}
                          </td>
                          <td className="py-3.5 px-2 text-right font-mono font-extrabold text-emerald-600 text-xs whitespace-nowrap">
                            {formatCurrency(d.total_amount_reconciled)}
                          </td>

                          {/* COLUNA DO VALOR FALTANTE */}
                          <td className="py-3.5 px-2 text-right whitespace-nowrap">
                            {hasMissing ? (
                              <span className="inline-flex items-center gap-1 font-mono font-extrabold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs">
                                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                {formatCurrency(d.total_missing_amount)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-xs">R$ 0,00</span>
                            )}
                          </td>

                          {/* COLUNA DA PRESTAÇÃO TOTAL ESPERADA */}
                          <td className="py-3.5 px-2 text-right font-mono font-extrabold text-slate-900 text-xs whitespace-nowrap">
                            {formatCurrency(expectedSum)}
                          </td>

                          <td className="py-3.5 px-2 font-mono text-[10px] text-slate-500 min-w-[120px]">
                            {formatDate(d.first_receipt_date)} <br/> até {formatDate(d.last_receipt_date)}
                          </td>

                          <td className="py-3.5 px-2 text-center">
                            <button
                              onClick={() => handleOpenDriverSessions(d)}
                              className="inline-flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              title="Ver os acertos finalizados e faltas deste motorista"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Acertos</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. RELATÓRIO POR BANCO                                    */}
      {/* ======================================================== */}
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
                    <th className="py-3.5 px-2">Instituição Bancária</th>
                    <th className="py-3.5 px-2 text-center">Total Lançamentos</th>
                    <th className="py-3.5 px-2 text-right">Volume Total</th>
                    <th className="py-3.5 px-2 text-right text-emerald-700">Conciliado (R$)</th>
                    <th className="py-3.5 px-2 text-right text-amber-700">Pendente (R$)</th>
                    <th className="py-3.5 px-2 text-center">Taxa Conciliação</th>
                    <th className="py-3.5 px-2 text-right text-blue-700">Volume Pix</th>
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
                        <td className="py-3.5 px-2 font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span>{b.bank_name}</span>
                        </td>
                        <td className="py-3.5 px-2 text-center font-mono">{b.total_transactions}</td>
                        <td className="py-3.5 px-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(b.total_volume)}
                        </td>
                        <td className="py-3.5 px-2 text-right font-mono font-extrabold text-emerald-600">
                          {formatCurrency(b.reconciled_sum)}
                        </td>
                        <td className="py-3.5 px-2 text-right font-mono font-extrabold text-amber-600">
                          {formatCurrency(b.pending_sum)}
                        </td>
                        <td className="py-3.5 px-2 text-center">
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
                        <td className="py-3.5 px-2 text-right font-mono font-extrabold text-blue-600">
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

      {/* ======================================================== */}
      {/* 3. TRILHA DE AUDITORIA COM REGISTRO DE VALORES FALTANTES */}
      {/* ======================================================== */}


      {/* ======================================================== */}
      {/* MODAL: ACERTOS INDIVIDUAIS DO MOTORISTA NO PERÍODO       */}
      {/* ======================================================== */}
      {inspectingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-600 text-white p-2 rounded-xl">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Acertos de Prestação de Contas • {inspectingDriver.driver_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    <span className="flex items-center gap-2">Placa: <LicensePlateBadge plate={inspectingDriver.vehicle_plate} /></span> • Rota: {inspectingDriver.route || 'Geral'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectingDriver(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Pix Conciliado</p>
                  <p className="text-lg font-extrabold text-emerald-600 mt-0.5">
                    {formatCurrency(inspectingDriver.total_amount_reconciled)}
                  </p>
                </div>

                <div className={`border rounded-xl p-3 ${
                  (inspectingDriver.total_missing_amount || 0) > 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Valor Faltante no Período</p>
                  <p className={`text-lg font-extrabold mt-0.5 ${
                    (inspectingDriver.total_missing_amount || 0) > 0 ? 'text-red-600' : 'text-slate-800'
                  }`}>
                    {formatCurrency(inspectingDriver.total_missing_amount || 0)}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Total Prestação Esperada</p>
                  <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {formatCurrency(
                      (inspectingDriver.total_amount_reconciled || 0) +
                      (inspectingDriver.total_missing_amount || 0)
                    )}
                  </p>
                </div>
              </div>

              {/* Sessions Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-3 bg-slate-100 border-b border-slate-200 font-extrabold text-slate-800 flex items-center justify-between text-[11px]">
                  <span>Sessões de Acerto Concluídas no Período ({driverSessions.length})</span>
                  {startDate && endDate && (
                    <span className="font-normal text-slate-500">
                      Filtrado de {formatDate(startDate)} até {formatDate(endDate)}
                    </span>
                  )}
                </div>

                {loadingDriverSessions ? (
                  <div className="p-8 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Carregando histórico de acertos...</p>
                  </div>
                ) : driverSessions.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <p>Nenhuma sessão individual encontrada para os critérios selecionados.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Data / Conclusão</th>
                          <th className="py-2.5 px-3">Operador</th>
                          <th className="py-2.5 px-3 text-center">Qtd Pix</th>
                          <th className="py-2.5 px-3 text-right">Pix (R$)</th>
                          <th className="py-2.5 px-3 text-right text-red-600">Valor Faltante</th>
                          <th className="py-2.5 px-3 text-right">Total Esperado</th>
                          <th className="py-2.5 px-3">Observações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {driverSessions.map((s) => {
                          const sessMissing = s.missing_amount || 0;
                          return (
                            <tr key={s.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                                {formatDateTime(s.completed_at || s.started_at)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                                {s.operator_user_name}
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold">
                                {s.total_items}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-600">
                                {formatCurrency(s.total_amount)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                {sessMissing > 0 ? (
                                  <span className="font-extrabold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-[11px] inline-flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-red-500" />
                                    {formatCurrency(sessMissing)}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">R$ 0,00</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900">
                                {formatCurrency((s.total_amount || 0) + sessMissing)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">
                                {s.notes || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectingDriver(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-4 py-1.5 rounded-xl font-bold cursor-pointer transition-colors text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
