import React, { useState, useEffect } from 'react';
import { ReconciliationSession, Transaction, Driver } from '../types';
import { api, formatCurrency, formatDateTime, formatPlate, formatDate } from '../services/api';
import { LicensePlateBadge } from '../components/LicensePlateBadge';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  FileSpreadsheet,
  Truck,
  CheckCircle2,
  Calendar,
  User,
  Printer,
  FileText,
  Search,
  ChevronRight,
  X,
  Building2,
  Store,
  Download,
  Trash2,
  AlertTriangle,
  Filter,
  RotateCcw
} from 'lucide-react';

export const SessionsView: React.FC = () => {
  const { currentUser, isAdmin } = useAuth();
  const { currentCompany } = useCompany();
  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [selectedDriverId, setSelectedDriverId] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [selectedSession, setSelectedSession] = useState<{
    session: ReconciliationSession;
    transactions: Transaction[];
  } | null>(null);
  const [txSearchInModal, setTxSearchInModal] = useState<string>('');
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Single settlement deletion state (Admin only)
  const [sessionToDelete, setSessionToDelete] = useState<ReconciliationSession | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [deleteSessionError, setDeleteSessionError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchAuxDrivers = async () => {
    try {
      const data = await api.getDrivers();
      setDrivers(data);
    } catch (err) {
      console.error('Failed to load drivers for filter:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await api.getSessions({
        driver_id: selectedDriverId,
        start_date: startDate,
        end_date: endDate,
        search: searchTerm
      });
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuxDrivers();
  }, [currentCompany?.id]);

  useEffect(() => {
    fetchSessions();
  }, [currentCompany?.id, selectedDriverId, startDate, endDate, searchTerm]);

  const handleOpenDetails = async (session: ReconciliationSession) => {
    try {
      setLoadingDetails(true);
      const res = await api.getSessionDetails(session.id);
      setSelectedSession(res);
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete || !currentUser) return;
    try {
      setIsDeletingSession(true);
      setDeleteSessionError(null);
      const res = await api.deleteSession(sessionToDelete.id, currentUser);
      setToastMsg(res.message);
      setTimeout(() => setToastMsg(null), 5000);
      setSessionToDelete(null);
      if (selectedSession?.session.id === sessionToDelete.id) {
        setSelectedSession(null);
      }
      await fetchSessions();
    } catch (err: any) {
      setDeleteSessionError(err.message || 'Erro ao excluir acerto finalizado.');
    } finally {
      setIsDeletingSession(false);
    }
  };

  // Date Quick Presets
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

  const resetAllFilters = () => {
    setSelectedDriverId('ALL');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
  };

  const hasActiveFilters = selectedDriverId !== 'ALL' || startDate !== '' || endDate !== '' || searchTerm !== '';

  const exportSessionsCsv = () => {
    if (sessions.length === 0) return;

    const headers = ['ID Acerto', 'Data Conclusao', 'Motorista', 'Placa', 'Operador', 'Qtd Pix', 'Total Pix (R$)', 'Valor Faltante (R$)', 'Total Prestacao (R$)', 'Observacoes'];
    const rows = sessions.map((s) => [
      s.id,
      formatDateTime(s.completed_at || s.started_at),
      `"${s.driver_name.replace(/"/g, '""')}"`,
      s.driver_plate || '',
      `"${s.operator_user_name.replace(/"/g, '""')}"`,
      s.total_items,
      (s.total_amount || 0).toFixed(2),
      (s.missing_amount || 0).toFixed(2),
      ((s.total_amount || 0) + (s.missing_amount || 0)).toFixed(2),
      `"${(s.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `acertos_conciliapix_${currentCompany.code.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleGeneratePdf = () => {
    if (!selectedSession) return;
    const doc = new jsPDF();
    const { session, transactions } = selectedSession;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('COMPROVANTE DE FECHAMENTO DE ACERTO', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Protocolo: #${session.id} | Concluído em: ${formatDateTime(session.completed_at || session.started_at)}`, 14, 26);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 30, 196, 30);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 34, 182, 26, 2, 2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('MOTORISTA:', 18, 42);
    doc.text('OPERADOR:', 105, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(`${session.driver_name} (Placa: ${formatPlate(session.driver_plate)})`, 18, 48);
    doc.text(`${session.operator_user_name}`, 105, 48);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('TOTAL PIX:', 18, 56);
    doc.text('VALOR FALTANTE:', 105, 56);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129);
    doc.text(formatCurrency(session.total_amount), 40, 56);

    doc.setTextColor(225, 29, 72);
    doc.text(formatCurrency(session.missing_amount || 0), 138, 56);

    let startY = 66;

    if (session.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('Observações:', 14, startY);
      doc.setFont('helvetica', 'normal');
      doc.text(session.notes, 14, startY + 5);
      startY += 14;
    }

    const tableData = transactions.map((tx, idx) => [
      idx + 1,
      formatDate(tx.date),
      tx.bank_name || '-',
      tx.document_number || '-',
      tx.voucher_number ? `#${tx.voucher_number}` : '-',
      tx.description || '-',
      formatCurrency(tx.amount)
    ]);

    autoTable(doc, {
      startY: startY,
      head: [['#', 'Data', 'Banco', 'Documento', 'Canhoto', 'Descrição', 'Valor (R$)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 22 },
        2: { cellWidth: 25 },
        3: { cellWidth: 22 },
        4: { cellWidth: 20 },
        5: { cellWidth: 55 },
        6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }
      },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 15;

    doc.setDrawColor(148, 163, 184);
    doc.line(25, finalY, 90, finalY);
    doc.line(120, finalY, 185, finalY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text(session.driver_name, 57, finalY + 5, { align: 'center' });
    doc.text(session.operator_user_name, 152, finalY + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Assinatura do Motorista', 57, finalY + 10, { align: 'center' });
    doc.text('Assinatura do Operador / Caixa', 152, finalY + 10, { align: 'center' });

    doc.save(`acerto_${session.driver_name.toLowerCase().replace(/\s+/g, '_')}_${session.id}.pdf`);
  };

  const totalConciliated = sessions.reduce((acc, s) => acc + (s.total_amount || 0), 0);
  const totalMissing = sessions.reduce((acc, s) => acc + (s.missing_amount || 0), 0);
  const totalItemsCount = sessions.reduce((acc, s) => acc + (s.total_items || 0), 0);
  const sessionsWithMissing = sessions.filter((s) => (s.missing_amount || 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="p-3.5 px-4 rounded-xl text-xs font-bold animate-fade-in flex items-center justify-between border shadow-xs bg-emerald-50 text-emerald-800 border-emerald-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button
            onClick={() => setToastMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Metrics Bar (Dynamically calculated based on filters) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">
              {hasActiveFilters ? 'Acertos Filtrados' : 'Acertos Finalizados'}
            </p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{sessions.length}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {hasActiveFilters ? 'Resultados com os filtros aplicados' : 'Sessões concluídas'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">
              {hasActiveFilters ? 'Total do Período' : 'Total Pix Conciliado'}
            </p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">
              {formatCurrency(totalConciliated)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {hasActiveFilters ? 'Soma dos acertos selecionados' : 'Soma de todos os motoristas'}
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className={`border rounded-2xl p-4 shadow-xs flex items-center justify-between ${
          totalMissing > 0 ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-slate-200'
        }`}>
          <div>
            <p className="text-xs text-slate-500 font-bold">
              {hasActiveFilters ? 'Faltante no Período' : 'Valor Geral Faltante'}
            </p>
            <p className={`text-2xl font-extrabold mt-1 ${totalMissing > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {formatCurrency(totalMissing)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {sessionsWithMissing > 0
                ? `${sessionsWithMissing} acerto(s) com pendência`
                : 'Nenhum débito pendente'}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${
            totalMissing > 0 ? 'bg-red-100 text-red-600 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-bold">Total de Pix Conferidos</p>
            <p className="text-2xl font-extrabold text-blue-600 mt-1">{totalItemsCount}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Comprovantes vinculados</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* FILTER PANEL: Driver, Date Range, Presets & Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
              Filtros de Busca de Acertos
            </h4>
          </div>

          <div className="flex items-center space-x-2">
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="inline-flex items-center space-x-1 text-xs font-bold text-slate-600 hover:text-red-600 bg-slate-100 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                title="Limpar todos os filtros"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar Filtros</span>
              </button>
            )}

            <button
              onClick={exportSessionsCsv}
              disabled={sessions.length === 0}
              className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Exportar listagem de acertos filtrados para CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Driver Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              <span>Filtrar por Motorista:</span>
            </label>
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-2xs"
            >
              <option value="ALL">Todos os Motoristas ({drivers.length})</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.vehicle_plate ? `(${formatPlate(d.vehicle_plate)})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Date Start */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Data Inicial (De):</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white shadow-2xs"
            />
          </div>

          {/* 3. Date End */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Data Final (Até):</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white shadow-2xs"
            />
          </div>

          {/* 4. Text Search */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-blue-600" />
              <span>Busca Rápida:</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Placa, operador, observação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-8 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white shadow-2xs"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Date Quick Shortcut Buttons */}
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

      {/* Sessions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm font-semibold text-slate-600">Carregando histórico de conciliações...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-bold text-slate-700">Nenhum acerto encontrado para os filtros selecionados.</p>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="mt-2 inline-flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Remover filtros de busca</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Data / Hora Conclusão</th>
                  <th className="py-3.5 px-4">Motorista Vinculado</th>
                  <th className="py-3.5 px-4">Placa Veículo</th>
                  <th className="py-3.5 px-4">Operador Responsável</th>
                  <th className="py-3.5 px-4 text-center">Qtd. Pix</th>
                  <th className="py-3.5 px-4 text-right">Total Pix</th>
                  <th className="py-3.5 px-4 text-right">Valor Faltante</th>
                  <th className="py-3.5 px-4 text-right">Total Prestação</th>
                  <th className="py-3.5 px-4">Observações</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => handleOpenDetails(s)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap font-medium">
                      {formatDateTime(s.completed_at || s.started_at)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2 capitalize">
                      <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{s.driver_name}</span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <LicensePlateBadge plate={s.driver_plate} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap capitalize">
                      {s.operator_user_name}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold">
                      <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full border border-slate-200">
                        {s.total_items}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-600 text-xs whitespace-nowrap">
                      {formatCurrency(s.total_amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {s.missing_amount && s.missing_amount > 0 ? (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-xs">
                          <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                          {formatCurrency(s.missing_amount)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">R$ 0,00</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-slate-900 text-xs whitespace-nowrap">
                      {formatCurrency((s.total_amount || 0) + (s.missing_amount || 0))}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {s.notes || '-'}
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => handleOpenDetails(s)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 text-xs font-bold transition-colors inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Ver Pix</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Admin only: Delete finished settlement */}
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteSessionError(null);
                              setSessionToDelete(s);
                            }}
                            className="bg-red-50 hover:bg-red-100 text-red-700 p-1.5 rounded-lg border border-red-200 text-xs transition-colors inline-flex items-center cursor-pointer shadow-2xs"
                            title="Excluir este acerto finalizado e reabrir lançamentos (Administrador)"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SESSION DETAILS MODAL & PRINTABLE RECEIPT */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 md:p-6 overflow-y-auto flex items-start justify-center">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl w-full max-w-4xl shadow-2xl text-slate-800 flex flex-col max-h-[92vh] sm:max-h-[90vh] my-auto overflow-hidden animate-fade-in print-container">
            {/* Modal Header */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 no-print">
              <div className="flex items-center space-x-3">
                <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-2xs">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Comprovante de Fechamento de Acerto
                  </h3>
                  <p className="text-xs text-slate-500">
                    Protocolo: #{selectedSession.session.id} • Concluído em{' '}
                    {formatDateTime(selectedSession.session.completed_at || selectedSession.session.started_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {isAdmin && (
                  <button
                    onClick={() => {
                      setDeleteSessionError(null);
                      setSessionToDelete(selectedSession.session);
                    }}
                    className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 cursor-pointer transition-colors"
                    title="Excluir este acerto finalizado e reabrir os lançamentos (Administrador)"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Excluir Acerto</span>
                  </button>
                )}
                <button
                  onClick={handleGeneratePdf}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs cursor-pointer transition-colors"
                  title="Gerar PDF do acerto"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Gerar PDF</span>
                </button>
                <button
                  onClick={handlePrint}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 shadow-xs cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedSession(null);
                    setTxSearchInModal('');
                  }}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Receipt Content - Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Motorista</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedSession.session.driver_name}
                  </p>
                  <div className="text-xs text-blue-700 font-mono font-bold mt-0.5">
                    Placa: {formatPlate(selectedSession.session.driver_plate)}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Operador Conferente</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedSession.session.operator_user_name}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Transações Pix</p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">
                    {selectedSession.transactions.length} itens conferidos
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Total Pix</p>
                  <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                    {formatCurrency(selectedSession.session.total_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Valor Faltante</p>
                  <p className={`text-base font-extrabold mt-0.5 ${
                    (selectedSession.session.missing_amount || 0) > 0 ? 'text-red-600' : 'text-slate-400'
                  }`}>
                    {formatCurrency(selectedSession.session.missing_amount || 0)}
                  </p>
                </div>
              </div>

              {(selectedSession.session.missing_amount || 0) > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-red-800 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Prestação com Débito / Valor Faltante:</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-red-700 text-sm">
                      {formatCurrency(selectedSession.session.missing_amount || 0)}
                    </span>
                    <span className="text-slate-500 ml-2">
                      (Prestação Total Esperada: {formatCurrency((selectedSession.session.total_amount || 0) + (selectedSession.session.missing_amount || 0))})
                    </span>
                  </div>
                </div>
              )}

              {selectedSession.session.notes && (
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                  <p className="text-[11px] text-slate-600 font-bold">Observações do Acerto:</p>
                  <p className="text-slate-800 mt-0.5">{selectedSession.session.notes}</p>
                </div>
              )}

              {/* Transactions List with Search Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-bold text-slate-800">
                    Lançamentos Pix Conciliados nesta Sessão ({selectedSession.transactions.length}):
                  </p>
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                    <input
                      type="text"
                      value={txSearchInModal}
                      onChange={(e) => setTxSearchInModal(e.target.value)}
                      placeholder="Filtrar Pix por valor, banco, canhoto..."
                      className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
                    />
                    {txSearchInModal && (
                      <button
                        type="button"
                        onClick={() => setTxSearchInModal('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {selectedSession.transactions
                    .filter((tx) => {
                      if (!txSearchInModal.trim()) return true;
                      const q = txSearchInModal.toLowerCase().trim();
                      return (
                        tx.description.toLowerCase().includes(q) ||
                        tx.bank_name.toLowerCase().includes(q) ||
                        (tx.voucher_number && tx.voucher_number.toLowerCase().includes(q)) ||
                        tx.amount.toString().includes(q) ||
                        (tx.document_number && tx.document_number.toLowerCase().includes(q))
                      );
                    })
                    .map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 bg-white flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                      >
                        <div className="space-y-0.5 max-w-[70%]">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-slate-500">{formatDate(tx.date)}</span>
                            <span className="font-bold text-slate-900 truncate">{tx.description}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1">
                              {(tx.bank_code === '001' || tx.bank_name?.toLowerCase().includes('brasil')) && (
                                <img src="/bancodobrasil.png" alt="Banco do Brasil" className="h-3 w-3 object-contain shrink-0" />
                              )}
                              {tx.bank_name}
                            </span>
                            {tx.document_number && <span>• Doc: {tx.document_number}</span>}
                            {tx.voucher_number && (
                              <span className="text-blue-700 font-mono font-bold">
                                • Canhoto #{tx.voucher_number}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right font-mono font-extrabold text-emerald-600 text-sm">
                          {formatCurrency(tx.amount)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Signature lines for physical printing */}
              <div className="pt-8 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-slate-600">
                <div>
                  <div className="border-b border-slate-400 mb-1 w-3/4 mx-auto"></div>
                  <p className="font-bold text-slate-800">{selectedSession.session.driver_name}</p>
                  <p className="text-[10px]">Assinatura do Motorista</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 mb-1 w-3/4 mx-auto"></div>
                  <p className="font-bold text-slate-800">
                    {selectedSession.session.operator_user_name}
                  </p>
                  <p className="text-[10px]">Assinatura do Operador / Caixa</p>
                </div>
              </div>
            </div>

            {/* Modal Footer - Sticky */}
            <div className="shrink-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print">
              <span className="text-slate-500 font-medium">
                Total de {selectedSession.transactions.length} comprovantes validados
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleGeneratePdf}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs cursor-pointer inline-flex items-center space-x-1 shadow-2xs transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Gerar PDF do Acerto</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedSession(null);
                    setTxSearchInModal('');
                  }}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-1.5 rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: SESSION DELETION (ACERTO) */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Excluir Acerto Finalizado
                  </h3>
                  <p className="text-xs text-slate-500">Exclusão irreversível deste acerto</p>
                </div>
              </div>
              <button
                onClick={() => setSessionToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Você tem certeza que deseja excluir o acerto do motorista <strong>{sessionToDelete.driver_name}</strong> (<LicensePlateBadge plate={sessionToDelete.driver_plate} className="inline-block align-middle mx-1" />) concluído em {formatDateTime(sessionToDelete.completed_at || sessionToDelete.started_at)}?
              </p>
              <p className="text-red-700 font-bold bg-red-50 p-2 rounded-lg border border-red-200">
                Atenção: Todos os lançamentos vinculados a este acerto serão liberados novamente para o extrato (status "Pendente").
              </p>

              {deleteSessionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{deleteSessionError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setSessionToDelete(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={isDeletingSession}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                {isDeletingSession ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
