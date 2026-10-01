import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { api, formatCurrency, formatDate } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  ArrowRight,
  Lock,
  Calendar,
  Building2,
  Database,
  Sparkles,
  Filter,
  DollarSign,
  HelpCircle
} from 'lucide-react';

interface LinkReturnModalProps {
  debitTx: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LinkReturnModal: React.FC<LinkReturnModalProps> = ({
  debitTx,
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuth();

  // Mode: 'suggested' (smart suggestions) vs 'search_all' (search whole statement database)
  const [activeTab, setActiveTab] = useState<'suggested' | 'search_all'>('suggested');

  // Suggested candidates state
  const [suggestedCandidates, setSuggestedCandidates] = useState<Transaction[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestedFilter, setSuggestedFilter] = useState('');

  // Whole statement search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStartDate, setSearchStartDate] = useState('');
  const [searchEndDate, setSearchEndDate] = useState('');
  const [searchStatus, setSearchStatus] = useState<string>('PENDING');
  const [searchedCandidates, setSearchedCandidates] = useState<Transaction[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected candidate object (preserved regardless of tab switching)
  const [selectedCredit, setSelectedCredit] = useState<Transaction | null>(null);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initial load when modal opens
  useEffect(() => {
    if (!isOpen || !debitTx) {
      setSuggestedCandidates([]);
      setSearchedCandidates([]);
      setSelectedCredit(null);
      setReason('');
      setSearchQuery('');
      setSearchStartDate('');
      setSearchEndDate('');
      setSearchStatus('PENDING');
      setSuggestedFilter('');
      setActiveTab('suggested');
      setHasSearched(false);
      setErrorMsg(null);
      return;
    }

    const loadSuggestions = async () => {
      try {
        setLoadingSuggestions(true);
        setErrorMsg(null);
        const res = await api.getReturnCandidates(debitTx.id, { mode: 'suggested' });
        const list = res.candidates || [];
        setSuggestedCandidates(list);

        // Preselect exact match if available
        const exact = list.find((c) => Math.abs(c.amount - debitTx.amount) < 0.01);
        if (exact) {
          setSelectedCredit(exact);
        } else if (list.length > 0) {
          setSelectedCredit(list[0]);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Falha ao buscar candidatos sugeridos.');
      } finally {
        setLoadingSuggestions(false);
      }
    };

    loadSuggestions();
  }, [isOpen, debitTx]);

  if (!isOpen || !debitTx) return null;

  // Search across whole statement in database
  const handleSearchWholeStatement = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      setLoadingSearch(true);
      setErrorMsg(null);
      setHasSearched(true);
      const res = await api.getReturnCandidates(debitTx.id, {
        q: searchQuery.trim(),
        start_date: searchStartDate.trim(),
        end_date: searchEndDate.trim(),
        status_filter: searchStatus,
        mode: 'search'
      });
      setSearchedCandidates(res.candidates || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao pesquisar em todo o extrato.');
    } finally {
      setLoadingSearch(false);
    }
  };

  // Filtered in-memory suggestions
  const filteredSuggestions = suggestedCandidates.filter((c) => {
    if (!suggestedFilter.trim()) return true;
    const rawQ = suggestedFilter.toLowerCase().trim();
    const cleanQ = rawQ.replace(/^r\$\s*/, '').replace(/\./g, '').replace(',', '.');
    const parsedQ = parseFloat(cleanQ);

    const orig = c.original_amount !== null && c.original_amount !== undefined ? Number(c.original_amount) : Number(c.amount);
    const matchesAmount = !isNaN(parsedQ) && (
      Math.abs(c.amount - parsedQ) < 0.01 ||
      Math.abs(orig - parsedQ) < 0.01 ||
      c.amount.toString().includes(cleanQ) ||
      orig.toString().includes(cleanQ) ||
      c.amount.toFixed(2).replace('.', ',').includes(rawQ)
    );

    return (
      matchesAmount ||
      c.description.toLowerCase().includes(rawQ) ||
      (c.counterparty_name && c.counterparty_name.toLowerCase().includes(rawQ)) ||
      (c.counterparty_doc && c.counterparty_doc.toLowerCase().includes(rawQ)) ||
      (c.document_number && c.document_number.toLowerCase().includes(rawQ)) ||
      (c.fitid && c.fitid.toLowerCase().includes(rawQ))
    );
  });

  const selectedCreditAmount = selectedCredit
    ? (selectedCredit.original_amount !== null && selectedCredit.original_amount !== undefined
        ? Number(selectedCredit.original_amount)
        : Number(selectedCredit.amount))
    : 0;

  const isExactAmount = selectedCredit ? Math.abs(selectedCreditAmount - debitTx.amount) < 0.01 : false;
  const isPartialReturn = selectedCredit ? debitTx.amount < selectedCreditAmount : false;
  const isDebitLarger = selectedCredit ? debitTx.amount > selectedCreditAmount : false;
  const netAmountAfterReturn = selectedCredit ? Math.max(0, selectedCreditAmount - debitTx.amount) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCredit) {
      setErrorMsg('Selecione uma entrada de Pix para vincular a esta saída de devolução.');
      return;
    }
    if (!currentUser) return;

    if (selectedCredit.status === 'RECONCILED') {
      setErrorMsg(`Atenção: A entrada #${selectedCredit.id} já está conciliada para o motorista "${selectedCredit.driver_name}". Reabra a conciliação antes de vinculá-la.`);
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await api.linkPixReturn({
        debitTxId: debitTx.id,
        creditTxId: selectedCredit.id,
        returnedAmount: debitTx.amount,
        reason: reason.trim() || undefined,
        actorUser: currentUser
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao vincular devolução.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderCandidateCard = (c: Transaction, source: 'suggested' | 'search') => {
    const isSelected = selectedCredit?.id === c.id;
    const origAmount = c.original_amount !== null && c.original_amount !== undefined ? Number(c.original_amount) : Number(c.amount);
    const isExact = Math.abs(origAmount - debitTx.amount) < 0.01;
    const isPartial = debitTx.amount < origAmount;
    const isLarger = debitTx.amount > origAmount;
    const isReconciled = c.status === 'RECONCILED';

    return (
      <div
        key={c.id}
        onClick={() => setSelectedCredit(c)}
        className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
          isSelected
            ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/30 shadow-xs'
            : isReconciled
            ? 'bg-amber-50/40 border-amber-200 hover:bg-amber-50'
            : 'bg-white hover:bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-extrabold text-emerald-600">
                + {formatCurrency(origAmount)}
              </span>

              {isExact ? (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  ✓ Devolução Total (100%)
                </span>
              ) : isPartial ? (
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-300">
                  ✂ Devolução Parcial (Abate {formatCurrency(debitTx.amount)})
                </span>
              ) : isLarger ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-300">
                  ⚠️ Saída maior que entrada
                </span>
              ) : null}

              {isReconciled ? (
                <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-300">
                  Já Conciliado ({c.driver_name})
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                  Pendente
                </span>
              )}

              <span className="text-[11px] text-slate-500 font-medium ml-auto">
                Data: {formatDate(c.date)}
              </span>
            </div>

            {c.counterparty_name && (
              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="text-slate-500 font-normal text-[11px]">Pagador:</span>
                <span>{c.counterparty_name}</span>
                {c.counterparty_doc && (
                  <span className="text-slate-400 font-normal font-mono text-[10px]">
                    ({c.counterparty_doc})
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="font-semibold text-slate-700">{c.bank_name}</span>
              {c.document_number && (
                <span className="font-mono text-slate-400">• Doc: {c.document_number}</span>
              )}
              {c.fitid && (
                <span className="font-mono text-slate-400">• ID: {c.fitid}</span>
              )}
            </div>

            <p className="font-mono text-[10px] text-slate-500 break-words line-clamp-2">
              {c.description}
            </p>
          </div>

          <div className="shrink-0 flex items-center pt-1">
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                isSelected
                  ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                  : 'border-slate-300 bg-white'
              }`}
            >
              {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-red-50/70 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="bg-red-100 p-2.5 rounded-xl text-red-700 border border-red-200 shadow-2xs">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Relacionar Saída de Devolução a uma Entrada
              </h3>
              <p className="text-xs text-slate-500">
                Localize e vincule a entrada de Pix correspondente em todo o extrato ou nas sugestões inteligentes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Card: Saída (Débito do Extrato a Devolver) */}
          <div className="bg-red-50/50 border border-red-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-wider text-red-800">
                Lançamento de Saída (Estorno / Devolução no Extrato)
              </span>
              <span className="font-mono text-base font-extrabold text-red-700">
                - {formatCurrency(debitTx.amount)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-slate-700 pt-1">
              <div>
                <span className="text-slate-400 text-[10px] block">Data do Débito:</span>
                <span className="font-semibold text-slate-900">{formatDate(debitTx.date)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Banco:</span>
                <span className="font-semibold text-slate-900">{debitTx.bank_name}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Favorecido / Destinatário:</span>
                <span className="font-bold text-slate-900 truncate block">
                  {debitTx.counterparty_name || '-'}
                </span>
              </div>
              <div className="sm:col-span-3">
                <span className="text-slate-400 text-[10px] block">Descrição no Extrato:</span>
                <p className="font-mono text-[11px] text-slate-800 break-words bg-white/80 p-2 rounded-xl border border-red-100">
                  {debitTx.description}
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation: Sugeridas vs Todo o Extrato */}
          <div className="border border-slate-200 rounded-2xl p-1 bg-slate-100 flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab('suggested')}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'suggested'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>Sugeridas pelo Sistema</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                activeTab === 'suggested' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {suggestedCandidates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('search_all');
                if (!hasSearched && searchedCandidates.length === 0) {
                  handleSearchWholeStatement();
                }
              }}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'search_all'
                  ? 'bg-white text-blue-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>Pesquisar em Todo o Extrato</span>
              {hasSearched && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  activeTab === 'search_all' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                }`}>
                  {searchedCandidates.length}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: SUGERIDAS PELO SISTEMA */}
          {activeTab === 'suggested' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600 font-semibold">
                  Sugestões automáticas por valor próximo, mesma data ou nome do cliente:
                </span>

                {/* Quick filter in suggestions */}
                <div className="relative w-56">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={suggestedFilter}
                    onChange={(e) => setSuggestedFilter(e.target.value)}
                    placeholder="Filtrar sugestões..."
                    className="w-full pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                  {suggestedFilter && (
                    <button
                      type="button"
                      onClick={() => setSuggestedFilter('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {loadingSuggestions ? (
                <div className="p-8 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p>Buscando entradas correspondentes...</p>
                </div>
              ) : filteredSuggestions.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500 space-y-2">
                  <p className="font-bold">Nenhuma sugestão automática encontrada.</p>
                  <p className="text-[11px] text-slate-400">
                    A entrada correspondente pode estar em outra data ou ter outro valor.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('search_all');
                      handleSearchWholeStatement();
                    }}
                    className="mt-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs inline-flex items-center space-x-1 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Pesquisar em Todo o Extrato Bancário</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {filteredSuggestions.map((c) => renderCandidateCard(c, 'suggested'))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PESQUISAR EM TODO O EXTRATO BANCÁRIO */}
          {activeTab === 'search_all' && (
            <div className="space-y-3">
              {/* Search Filters Grid */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Pesquisar por Nome do Pagador / CPF / Descrição / Valor:
                    </label>
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Ex: João Silva, 123.456, R$ 150,00, ou parte da descrição..."
                        className="w-full pl-8 pr-20 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 shadow-2xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchWholeStatement();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSearchWholeStatement()}
                        disabled={loadingSearch}
                        className="absolute right-1 top-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        {loadingSearch ? 'Buscando...' : 'Buscar'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Data Inicial:
                    </label>
                    <input
                      type="date"
                      value={searchStartDate}
                      onChange={(e) => setSearchStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Data Final:
                    </label>
                    <input
                      type="date"
                      value={searchEndDate}
                      onChange={(e) => setSearchEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Status da Entrada:
                    </label>
                    <select
                      value={searchStatus}
                      onChange={(e) => setSearchStatus(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                    >
                      <option value="PENDING">Apenas Pendentes (Recomendado)</option>
                      <option value="ALL">Todas (Pendentes e Conciliadas)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span className="text-slate-500">
                    {hasSearched ? (
                      loadingSearch ? (
                        'Pesquisando no banco de dados...'
                      ) : (
                        <strong>{searchedCandidates.length} crédito(s) encontrado(s) no extrato</strong>
                      )
                    ) : (
                      'Pressione "Buscar" para pesquisar em todos os lançamentos de crédito importados'
                    )}
                  </span>

                  {(searchQuery || searchStartDate || searchEndDate || searchStatus !== 'PENDING') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchStartDate('');
                        setSearchEndDate('');
                        setSearchStatus('PENDING');
                        setSearchedCandidates([]);
                        setHasSearched(false);
                      }}
                      className="text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
                    >
                      Limpar Filtros de Busca
                    </button>
                  )}
                </div>
              </div>

              {/* Search Results */}
              {loadingSearch ? (
                <div className="p-8 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p>Consultando todos os créditos no extrato bancário...</p>
                </div>
              ) : hasSearched && searchedCandidates.length === 0 ? (
                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500">
                  <p className="font-bold">Nenhum crédito encontrado com esses termos de busca.</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Tente buscar por outro nome, valor sem pontuação, ou amplie o período de datas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {searchedCandidates.map((c) => renderCandidateCard(c, 'search'))}
                </div>
              )}
            </div>
          )}

          {/* Section: Preview do Vínculo Selecionado */}
          {selectedCredit && (
            <div className={`p-4 rounded-2xl border space-y-2 transition-all ${
              isPartialReturn
                ? 'bg-blue-50/90 border-blue-200 text-blue-950'
                : isDebitLarger
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5 text-xs">
                  <RotateCcw className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    {isPartialReturn
                      ? 'Resultado: Devolução Parcial de Pix'
                      : isDebitLarger
                      ? 'Atenção: Saída Maior que a Entrada'
                      : 'Resultado: Devolução Total de Pix (100%)'}
                  </span>
                </span>
                <span className="font-mono text-sm font-extrabold text-blue-900">
                  {isPartialReturn
                    ? `Saldo Líquido: ${formatCurrency(netAmountAfterReturn)}`
                    : 'Bloqueio Integral'}
                </span>
              </div>

              {/* Detalhes da Entrada Selecionada */}
              <div className="bg-white/80 border border-slate-200/80 rounded-xl p-3 text-xs space-y-1 font-mono">
                <div className="flex justify-between text-slate-700">
                  <span>Entrada Selecionada (#{selectedCredit.id}):</span>
                  <span className="font-bold text-slate-900">{formatCurrency(selectedCreditAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Data da Entrada:</span>
                  <span>{formatDate(selectedCredit.date)}</span>
                </div>
                {selectedCredit.counterparty_name && (
                  <div className="flex justify-between text-slate-700 font-sans">
                    <span>Pagador Original:</span>
                    <strong className="text-slate-900">{selectedCredit.counterparty_name}</strong>
                  </div>
                )}
                <div className="flex justify-between text-red-700 font-bold border-t border-slate-100 pt-1">
                  <span>(-) Valor Devolvido (Saída):</span>
                  <span>- {formatCurrency(debitTx.amount)}</span>
                </div>
                {isPartialReturn && (
                  <div className="flex justify-between text-emerald-700 font-extrabold border-t border-slate-100 pt-1 text-sm">
                    <span>(=) Saldo Restante para o Motorista:</span>
                    <span>{formatCurrency(netAmountAfterReturn)}</span>
                  </div>
                )}
              </div>

              {isPartialReturn ? (
                <p className="text-[11px] text-blue-900">
                  ✓ A transação de entrada <strong>continuará pendente</strong> com o saldo líquido de <strong>{formatCurrency(netAmountAfterReturn)}</strong>, permitindo que o operador concilie o valor correto na prestação de contas do motorista.
                </p>
              ) : (
                <p className="text-[11px] text-slate-700">
                  ✓ A entrada de {formatCurrency(selectedCreditAmount)} será <strong>bloqueada integralmente</strong> com status <strong>RETURNED</strong>, evitando qualquer conciliação indevida.
                </p>
              )}
            </div>
          )}

          {/* Section: Observações / Motivo */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Motivo / Observação do Vínculo (opcional):
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Devolução ao cliente por mercadoria devolvida / cancelamento parcial"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-red-800 flex items-start space-x-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer text-xs"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitting || !selectedCredit}
              className={`text-white font-bold px-4 py-2.5 rounded-xl cursor-pointer shadow-md inline-flex items-center space-x-2 text-xs disabled:opacity-50 ${
                isPartialReturn
                  ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                  : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Processando Vínculo...'
                  : isPartialReturn
                  ? `Confirmar Devolução Parcial (Saldo: ${formatCurrency(netAmountAfterReturn)})`
                  : 'Confirmar Devolução Total e Bloquear'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
