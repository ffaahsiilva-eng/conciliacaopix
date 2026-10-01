import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight, UserCheck } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const { users, login } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Update selected user when users list loads
  React.useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [users, selectedUserId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setErrorMsg('Selecione um usuário para entrar.');
      return;
    }
    if (!password) {
      setErrorMsg('Digite a senha de acesso deste usuário.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);
      await login(selectedUserId, password);
    } catch (err: any) {
      setErrorMsg(err.message || 'Senha incorreta. Não é permitido acessar sem a senha devida.');
    } finally {
      setLoading(false);
    }
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ConciliaPix</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Sistema Integrado de Conciliação Bancária & Motoristas
          </p>
          <div className="inline-flex items-center gap-1.5 mt-2 bg-blue-100 text-blue-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
            <Lock className="w-3 h-3" />
            <span>Acesso Restrito por Senha Individual</span>
          </div>
        </div>

        {/* Login Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* User Select / Cards */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Selecione o Usuário que está acessando:
              </label>
              
              <div className="grid grid-cols-1 gap-2 mb-2">
                {users.map((u) => {
                  const isSelected = u.id === selectedUserId;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setErrorMsg(null);
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-slate-50/80 hover:bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 leading-tight">{u.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{u.email}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            u.role === 'ADMIN'
                              ? 'bg-red-100 text-red-800'
                              : u.role === 'OPERATOR'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {u.role === 'ADMIN' ? 'Admin' : u.role === 'OPERATOR' ? 'Operador' : 'Auditor'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Senha de Acesso de {selectedUser?.name || 'Usuário'}:</span>
                </label>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="Digite sua senha de acesso"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition-all pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 p-0.5"
                  title={showPassword ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-2 text-xs text-red-800 animate-fade-in">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-xs transition-all shadow-md shadow-blue-600/25 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <span>{loading ? 'Validando senha...' : 'Entrar no Sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Cada usuário possui sua própria senha individual de acesso confidencial.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
