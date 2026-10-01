import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';
import { api } from '../services/api';
import { BankAccount } from '../types';
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  X,
  Download,
  Building2,
  Store,
  ShieldCheck
} from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
  banks: BankAccount[];
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
  banks
}) => {
  const { currentUser } = useAuth();
  const { currentCompany } = useCompany();
  const isMatriz = currentCompany.id === 'matriz' || currentCompany.code === 'MATRIZ';
  const [activeTab, setActiveTab] = useState<'upload' | 'sample' | 'banks'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBankName, setSelectedBankName] = useState<string>('Banco Itaú Unibanco');
  const [selectedBankCode, setSelectedBankCode] = useState<string>('341');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    importedCount: number;
    skippedDuplicateCount: number;
    bankName: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleBankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const bName = e.target.value;
    setSelectedBankName(bName);
    const found = banks.find((b) => b.bank_name === bName);
    if (found) setSelectedBankCode(found.bank_code);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    setSuccessResult(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      const name = file.name.toLowerCase();
      if (!name.endsWith('.ofx') && !name.endsWith('.csv') && !name.endsWith('.txt')) {
        setErrorMsg('Por favor selecione um arquivo válido com extensão .OFX ou .CSV.');
      }
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      setErrorMsg('Selecione um arquivo de extrato bancário para continuar.');
      return;
    }
    if (!currentUser) {
      setErrorMsg('Usuário não autenticado.');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMsg(null);
      setSuccessResult(null);

      const content = await selectedFile.text();
      const isOfx = selectedFile.name.toLowerCase().endsWith('.ofx');

      const res = await api.uploadStatement({
        filename: selectedFile.name,
        content,
        format: isOfx ? 'OFX' : 'CSV',
        bankName: selectedBankName,
        bankCode: selectedBankCode,
        actorUser: currentUser,
        company_id: currentCompany.id
      });

      setSuccessResult({
        importedCount: res.importedCount,
        skippedDuplicateCount: res.skippedDuplicateCount,
        bankName: res.bankName
      });

      onUploadSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar o arquivo de extrato bancário.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSampleOfx = () => {
    const today = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const sampleContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILESPEC:NONE
NEWFILESPEC:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${today}
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>341
<ACCTID>56789-0
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260901
<DTEND>20260930
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260929
<TRNAMT>2850.00
<FITID>OFX-PIX-9011
<CHECKNUM>PIX9011
<MEMO>PIX RECEBIDO - MERCADO SAO JORGE LTDA
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260929
<TRNAMT>1120.40
<FITID>OFX-PIX-9012
<CHECKNUM>PIX9012
<MEMO>PIX RECEBIDO - COMERCIO BELEM ALIMENTOS
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260930
<TRNAMT>3750.00
<FITID>OFX-PIX-9013
<CHECKNUM>PIX9013
<MEMO>PIX TRANSF - AUTO CENTER BRASIL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260930
<TRNAMT>940.00
<FITID>OFX-PIX-9014
<CHECKNUM>PIX9014
<MEMO>PIX RECEBIDO - PADARIA NOVA ERA
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260930
<TRNAMT>-150.00
<FITID>OFX-TAR-9015
<CHECKNUM>TAR9015
<MEMO>TARIFA MENSALIDADE CONTA PJ
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>58420.50
<DTASOF>${today}
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    const blob = new Blob([sampleContent], { type: 'application/x-ofx' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Extrato_Demonstrativo_Itau_${new Date().toISOString().slice(0, 10)}.ofx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSampleCsv = () => {
    const csvContent = `Data;Lançamento / Histórico;Documento;Valor (R$)
30/09/2026;PIX RECEBIDO - FARMACIA CENTRAL BRASIL;PIX-88219;1680,00
30/09/2026;PIX RECEBIDO - MERCEARIA DO ZE LTDA;PIX-88220;540,50
29/09/2026;PIX TRANSF - POSTO E CONVENIENCIA ALVORADA;PIX-88221;2450,00
29/09/2026;PIX RECEBIDO - DISTRIBUIDORA NORTE GRAOS;PIX-88222;4120,00
28/09/2026;TED RECEBIDA CLIENTE ATACADISTA;TED-3301;8500,00
28/09/2026;TARIFA TED/PIX BANCARIO;TAR-991;-25,00`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Extrato_Demonstrativo_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl text-slate-800 overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-700 border border-blue-200">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Importar Extrato Bancário</h3>
              <p className="text-xs text-slate-500">
                Compatível com OFX e CSV de qualquer banco com antiduplicação de dados
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab strip */}
        <div className="flex border-b border-slate-200 bg-slate-50/60 px-6 space-x-4 text-xs font-bold">
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'upload'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>Enviar Arquivo</span>
          </button>
          <button
            onClick={() => setActiveTab('sample')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'sample'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Baixar Modelos Exemplo</span>
          </button>
          <button
            onClick={() => setActiveTab('banks')}
            className={`py-3 border-b-2 flex items-center space-x-2 transition-colors cursor-pointer ${
              activeTab === 'banks'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Instituições Homologadas</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeTab === 'upload' && (
            <div className="space-y-4">
              {/* Target Company Destination Indicator */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                  isMatriz
                    ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`p-1.5 rounded-lg ${
                      isMatriz ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {isMatriz ? <Building2 className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                      Empresa de Destino da Importação
                    </span>
                    <strong className="text-slate-900">{currentCompany.name}</strong>
                    {currentCompany.cnpj && (
                      <span className="text-[11px] text-slate-500 ml-1.5 font-mono">
                        ({currentCompany.cnpj})
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isMatriz ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {currentCompany.code}
                </span>
              </div>

              {/* Institution Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Instituição Bancária do Extrato:
                </label>
                <select
                  value={selectedBankName}
                  onChange={handleBankChange}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-xs"
                >
                  {banks.map((b) => (
                    <option key={b.id} value={b.bank_name}>
                      {b.bank_name} ({b.bank_code})
                    </option>
                  ))}
                  <option value="Outro Banco / Cooperativa">Outro Banco ou Cooperativa de Crédito</option>
                </select>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".ofx,.csv,.txt"
                  className="hidden"
                />

                <div className="w-12 h-12 mx-auto bg-blue-100 group-hover:bg-blue-200 text-blue-700 rounded-full flex items-center justify-center mb-3 transition-colors shadow-xs">
                  <UploadCloud className="w-6 h-6" />
                </div>

                {selectedFile ? (
                  <div>
                    <p className="text-sm font-bold text-slate-900 flex items-center justify-center gap-2">
                      <FileCode className="w-4 h-4 text-blue-600" />
                      <span>{selectedFile.name}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Tamanho: {(selectedFile.size / 1024).toFixed(1)} KB • Clique para escolher outro
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      Clique para selecionar o arquivo ou arraste até aqui
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Formatos aceitos: <strong className="text-blue-700 font-mono">.OFX</strong> (padrão bancário) ou <strong className="text-blue-700 font-mono">.CSV</strong> (delimitado por ponto-e-vírgula ou vírgula)
                    </p>
                  </div>
                )}
              </div>

              {/* Deduplication Guarantee Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-blue-950">Garantia Antiduplicação & Grandes Volumes:</strong>
                  <p className="text-blue-900/80 mt-0.5">
                    Pode importar arquivos com mais de 1 ano de extrato. O sistema verifica cada transação
                    por código de autenticação FITID, data e valor, ignorando automaticamente lançamentos já
                    existentes no banco de dados.
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Atenção:</strong>
                    <p className="mt-0.5">{errorMsg}</p>
                  </div>
                </div>
              )}

              {/* Success Alert */}
              {successResult && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center space-x-2 font-bold text-emerald-800 text-sm">
                    <CheckCircle className="w-5 h-5 text-emerald-600" />
                    <span>Importação Concluída com Sucesso!</span>
                  </div>
                  <p className="text-emerald-800">
                    • <strong>{successResult.importedCount} novas transações</strong> inseridas no banco de dados.
                  </p>
                  {successResult.skippedDuplicateCount > 0 && (
                    <p className="text-amber-800">
                      • <strong>{successResult.skippedDuplicateCount} transações duplicadas</strong> foram
                      detectadas e ignoradas com segurança.
                    </p>
                  )}
                  <p className="text-emerald-700">Banco: {successResult.bankName}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sample' && (
            <div className="space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                Você pode baixar arquivos prontos de teste com diversas movimentações de Pix para verificar o
                funcionamento imediato da conciliação bancária:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-blue-700 font-bold text-sm">
                    <FileCode className="w-5 h-5" />
                    <span>Modelo de Extrato OFX</span>
                  </div>
                  <p className="text-slate-500">
                    Formato oficial de exportação de extratos dos bancos Itaú, Bradesco, Banco do Brasil, Santander,
                    Inter e outros.
                  </p>
                  <button
                    onClick={downloadSampleOfx}
                    className="w-full flex items-center justify-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>Baixar Extrato_Demo.ofx</span>
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-700 font-bold text-sm">
                    <FileSpreadsheet className="w-5 h-5" />
                    <span>Modelo de Extrato CSV</span>
                  </div>
                  <p className="text-slate-500">
                    Formato CSV com colunas de Data, Histórico com Pix, Documento e Valor em moeda brasileira (R$).
                  </p>
                  <button
                    onClick={downloadSampleCsv}
                    className="w-full flex items-center justify-center space-x-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold py-2 px-3 rounded-xl border border-slate-300 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Baixar Extrato_Demo.csv</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'banks' && (
            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                O ConciliaPix é compatível com extratos emitidos pelos principais bancos e instituições:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {banks.map((b) => (
                  <div
                    key={b.id}
                    className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center space-x-2"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: b.color || '#2563eb' }}
                    />
                    <div className="truncate">
                      <p className="font-bold text-slate-900 truncate">{b.bank_name}</p>
                      <p className="text-[10px] text-slate-500">Cód: {b.bank_code}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-slate-600 hover:text-slate-900 px-3 py-2 rounded-xl font-semibold cursor-pointer"
          >
            Fechar
          </button>

          {activeTab === 'upload' && (
            <button
              onClick={handleUploadSubmit}
              disabled={isProcessing || !selectedFile}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all ${
                !isProcessing && selectedFile
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Processando e Sincronizando...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Processar e Importar Extrato</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
