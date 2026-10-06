import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Lock, Eye, EyeOff, AlertCircle, X, ShieldCheck, ArrowRight, UserCheck } from 'lucide-react';

interface SwitchUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SwitchUserModal: React.FC<SwitchUserModalProps> = ({ isOpen, onClose }) => {
  const { users, currentUser, login } = useAuth();
  const otherUsers = users.filter((u) => u.id !== currentUser?.id);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(otherUsers[0]?.id || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (otherUsers.length > 0 && !selectedTargetId) {
      setSelectedTargetId(otherUsers[0].id);
    }
  }, [otherUsers, selectedTargetId]);

  if (!isOpen) return null;

  const targetUser = users.find((u) => u.id === selectedTargetId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId) {
      setErrorMsg('Selecione o usuário desejado.');
      return;
    }
    if (!password) {
      setErrorMsg('Digite a senha de acesso deste usuário.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      // Libera todos os locks do usuário atual ANTES de autenticar como outro.
      // Sem isso, locks do usuário anterior vazam até fechar a aba.
      if (currentUser) {
        try {
          await api.unlockAllByUser(currentUser);
        } catch (unlockErr) {
          // Não bloquear troca de usuário se o unlock falhar — o servidor
          // tem cleanupOrphanLocks que vai pegar depois.
          console.warn('[SwitchUserModal] unlockAllByUser falhou (não crítico):', unlockErr);
        }
      }
      await login(selectedTargetId, password);
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err.message || 'Senha incorreta. Não é permitido acessar o cadastro de outro usuário sem a devida senha.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-blue-50/60">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-100 p-2 rounded-xl text-blue-700">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Trocar de Usuário</h3>
              <p className="text-xs text-slate-500">Exige a senha de acesso do usuário de destino</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-2">
              Selecione o perfil que deseja acessar:
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {otherUsers.map((u) => {
                const isSelected = u.id === selectedTargetId;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedTargetId(u.id);
                      setPassword('');
                      setErrorMsg(null);
                    }}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="text-[10px] text-slate-500">{u.email}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">
                      {u.role}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Senha de acesso de {targetUser?.name || 'usuário'}:</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="Digite a senha deste usuário"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2 text-slate-400 hover:text-slate-700 p-0.5"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              Trava de segurança: ninguém pode assumir a identidade de outro operador sem a sua senha.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-xl flex items-start space-x-2 text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{errorMsg}</span>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl cursor-pointer shadow-xs inline-flex items-center space-x-1.5"
            >
              <span>{loading ? 'Verificando...' : 'Autenticar & Trocar'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
