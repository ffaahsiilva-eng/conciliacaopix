import React, { useState, useEffect } from 'react';
import { ImportBatch } from '../types';
import { api, formatCurrency, formatDateTime, formatDate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Building2,
  Store,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  X,
  Search,
  LayoutGrid,
  List,
  Clock,
  ArrowRight,
  Database
} from 'lucide-react';

interface BatchesViewProps {
  onOpenUpload: () => void;
}

export const BatchesView: React.FC<BatchesViewProps> = ({ onOpenUpload }) => {
  const { currentUser, isAdmin } = useAuth();
  const { currentCompany } = useCompany();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Single file deletion state
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Global clean database state (administrative)
  const [cleanDbModalOpen, setCleanDbModalOpen] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showAdminMaintenance, setShowAdminMaintenance] = useState(false);

  const [notificationMsg, setNotificationMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const data = await api.getBatches();
      setBatches(data);
    } catch (err) {
      console.error('Failed to load batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [currentCompany?.id]);

  const handleDeleteSingleBatch = async (force = false) => {
    if (!batchToDelete) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await api.deleteBatch(batchToDelete.id, currentUser || undefined, force);
      setNotificationMsg({
        type: 'success',
        text: `Arquivo "${batchToDelete.filename}" e seus lançamentos foram excluídos com sucesso.`
      });
      setTimeout(() => setNotificationMsg(null), 5000);
      setBatchToDelete(null);
      await fetchBatches();
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir arquivo de extrato.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCleanDatabase = async () => {
    if (!isAdmin) {
      alert('Apenas Administradores podem limpar o banco de dados.');
      return;
    }
    try {
      setIsCleaning(true);
      const res = await api.cleanDatabase(currentUser || undefined, true);
      setNotificationMsg({
        type: 'success',
        text: res.message
      });
      setTimeout(() => setNotificationMsg(null), 5000);
      setCleanDbModalOpen(false);
      await fetchBatches();
    } catch (err: any) {
      alert(err.message || 'Erro ao limpar banco de dados');
    } finally {
      setIsCleaning(false);
    }
  };

  const filteredBatches = batches.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.filename.toLowerCase().includes(q) ||
      b.bank_name.toLowerCase().includes(q) ||
      (b.bank_code && b.bank_code.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notificationMsg && (
        <div
          className={`p-3.5 px-4 rounded-xl text-xs font-bold animate-fade-in flex items-center justify-between border shadow-xs ${
            notificationMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <span>{notificationMsg.text}</span>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-slate-400 hover:text-slate-800 ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                Arquivos de Extratos Importados (OFX / CSV)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Exclua ou gerencie <strong>cada arquivo de extrato de forma individual</strong>. Ao excluir um arquivo, os outros extratos permanecem intactos.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenUpload}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 transition-all shadow-xs cursor-pointer"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Importar Novo Extrato</span>
        </button>
      </div>

      {/* Control bar: Search and View Mode */}
      {batches.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs shadow-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar arquivo por nome ou banco..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-3">
            <span className="text-slate-500">
              Total: <strong>{batches.length}</strong> arquivo(s) importado(s)
            </span>

            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-white text-blue-700 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Visualização em Cartões"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-blue-700 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Visualização em Tabela"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 shadow-xs">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm font-semibold text-slate-600">Carregando arquivos de extrato...</p>
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-4 shadow-xs">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Nenhum extrato importado no sistema</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Importe seus arquivos <strong>.OFX</strong> ou <strong>.CSV</strong> de qualquer banco. Cada arquivo aparecerá listado separadamente aqui com a opção individual de <strong>Excluir Arquivo</strong>.
            </p>
          </div>
          <div>
            <button
              onClick={onOpenUpload}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs cursor-pointer shadow-xs inline-flex items-center space-x-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Importar Primeiro Arquivo</span>
            </button>
          </div>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500 shadow-xs">
          <p className="text-sm font-bold text-slate-800">Nenhum arquivo encontrado para a busca "{searchQuery}".</p>
          <button
            onClick={() => setSearchQuery('')}
            className="text-xs text-blue-600 font-bold mt-2 hover:underline cursor-pointer"
          >
            Limpar busca
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        /* CARDS VIEW - VERY CLEAR INDIVIDUAL FILE CARDS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBatches.map((b) => (
            <div
              key={b.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                {/* Card Top: Badges & Format */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center space-x-1.5 bg-blue-50 text-blue-700 border border-blue-200 font-mono text-[10px] font-bold px-2 py-0.5 rounded-md">
                    {b.format === 'OFX' ? (
                      <FileCode className="w-3.5 h-3.5" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{b.format}</span>
                  </span>

                  <span className="text-[11px] text-slate-500 font-medium truncate">
                    {b.bank_name}
                  </span>
                </div>

                {/* File Name */}
                <h4
                  className="text-sm font-extrabold text-slate-900 font-mono break-all mb-2 leading-snug"
                  title={b.filename}
                >
                  {b.filename}
                </h4>

                {/* Metrics */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 text-xs mb-4">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Lançamentos no arquivo:</span>
                    <strong className="text-slate-900">{b.total_transactions} itens</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Volume Crédito:</span>
                    <strong className="text-emerald-700 font-mono">{formatCurrency(b.total_credit)}</strong>
                  </div>
                  {b.reconciled_count !== undefined && b.reconciled_count > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-bold text-[11px]">
                      <span>Já conciliados com motoristas:</span>
                      <span>{b.reconciled_count} itens</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-slate-400 text-[10px] pt-1 border-t border-slate-200">
                    <span>Importado em:</span>
                    <span className="font-mono">{formatDateTime(b.imported_at)}</span>
                  </div>
                </div>
              </div>

              {/* Individual File Delete Button (Admin Only) */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                  Por: {b.imported_by_user_name}
                </span>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setBatchToDelete(b);
                    }}
                    className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-900 border border-red-200 hover:border-red-300 font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
                    title={`Excluir apenas o arquivo ${b.filename}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Excluir este Arquivo</span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400 italic">
                    Exclusão restrita ao Admin
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TABLE VIEW WITH PROMINENT ACTION BUTTON */
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Nome do Arquivo</th>
                  <th className="py-3.5 px-4">Banco</th>
                  <th className="py-3.5 px-4 text-center">Formato</th>
                  <th className="py-3.5 px-4 text-center">Lançamentos</th>
                  <th className="py-3.5 px-4 text-right">Volume Crédito</th>
                  <th className="py-3.5 px-4">Data Importação</th>
                  <th className="py-3.5 px-4 text-center w-40">Ação Individual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2">
                      {b.format === 'OFX' ? (
                        <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <span className="font-mono">{b.filename}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 whitespace-nowrap font-medium">
                      {b.bank_name}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="bg-blue-50 text-blue-700 font-mono text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                        {b.format}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="font-bold text-slate-900">{b.total_transactions} itens</div>
                      {b.reconciled_count ? (
                        <div className="text-[10px] text-emerald-700 font-bold">
                          {b.reconciled_count} conciliados
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-600 whitespace-nowrap">
                      {formatCurrency(b.total_credit)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTime(b.imported_at)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setBatchToDelete(b);
                          }}
                          className="bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-900 border border-red-200 hover:border-red-300 font-extrabold px-3 py-1.5 rounded-xl text-xs inline-flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
                          title={`Excluir apenas o arquivo ${b.filename}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>Excluir Arquivo</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">
                          Apenas Admin
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Advanced Maintenance Option (Admin only) */}
      {isAdmin && (
        <div className="pt-6 border-t border-slate-200">
          <div className="bg-slate-100/70 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-slate-500" />
                <span>Manutenção do Banco de Dados (Exclusivo Administrador)</span>
              </span>
              <p className="text-slate-500 mt-0.5">
                Caso deseje zerar todos os extratos de uma só vez para recomeçar o sistema do zero.
              </p>
            </div>

            <button
              onClick={() => setCleanDbModalOpen(true)}
              className="text-xs text-red-700 hover:text-red-800 bg-white hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer shrink-0"
            >
              Limpar Todo o Banco de Dados
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: SINGLE FILE DELETION */}
      {batchToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Excluir Arquivo Específico
                  </h3>
                  <p className="text-xs text-slate-500">Exclusão isolada deste arquivo</p>
                </div>
              </div>
              <button
                onClick={() => setBatchToDelete(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Você solicitou excluir <strong>apenas o arquivo abaixo</strong>:
              </p>

              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-900 font-mono text-sm break-all">
                  <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{batchToDelete.filename}</span>
                </div>
                <p className="text-slate-600 font-medium">Banco: {batchToDelete.bank_name}</p>
                <p className="text-slate-600">
                  Total de lançamentos a remover: <strong>{batchToDelete.total_transactions}</strong>
                </p>
                <p className="text-emerald-700 font-mono font-bold">
                  Volume de crédito: {formatCurrency(batchToDelete.total_credit)}
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] leading-relaxed">
                ℹ️ <strong>Atenção:</strong> Somente as transações deste arquivo específico serão excluídas. Quaisquer outros extratos importados continuarão salvos e operacionais.
              </div>

              {batchToDelete.reconciled_count && batchToDelete.reconciled_count > 0 ? (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-[11px]">
                  ⚠️ <strong>Aviso:</strong> Este lote possui <strong>{batchToDelete.reconciled_count} transação(ões)</strong> já vinculadas a motoristas.
                </div>
              ) : null}

              {deleteError && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start space-x-2 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Aviso do Sistema:</strong>
                    <p className="mt-0.5">{deleteError}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setBatchToDelete(null)}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex items-center space-x-2">
                {deleteError && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSingleBatch(true)}
                    disabled={isDeleting}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-2 rounded-xl text-xs cursor-pointer shadow-xs"
                  >
                    Confirmar Forçado
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleDeleteSingleBatch(false)}
                  disabled={isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs flex items-center space-x-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir este Arquivo'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: COMPLETE DATABASE RESET */}
      {cleanDbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50">
              <div className="flex items-center space-x-3">
                <div className="bg-red-100 p-2 rounded-xl text-red-700 border border-red-200">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Limpar Banco de Dados</h3>
                  <p className="text-xs text-slate-500">Zerar extratos e movimentações</p>
                </div>
              </div>
              <button
                onClick={() => setCleanDbModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Tem certeza que deseja apagar <strong>todos os extratos e transações de uma só vez</strong>?
              </p>
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-900 text-[11px]">
                • Se desejar remover apenas um arquivo específico, cancele e use o botão <strong>"Excluir este Arquivo"</strong> no cartão do arquivo correspondente.
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCleanDbModalOpen(false)}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 font-semibold cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleCleanDatabase}
                disabled={isCleaning}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isCleaning ? 'Limpando...' : 'Confirmar e Zerar Tudo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
