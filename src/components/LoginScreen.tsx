import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import './LoginScreen.css';

export const LoginScreen: React.FC = () => {
  const { users, login } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Update selected user when users list loads
  useEffect(() => {
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
    <div className="login-page-wrapper">
      <div className="login-container">
        
        <div className="login-header">
          <div className="icon-shield">
            {/* SVG de Escudo Simples */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          </div>
          <h1>ConciliaPix</h1>
          <p>Sistema Integrado de Conciliação</p>
        </div>

        {errorMsg && (
          <div className="login-error">
            {errorMsg}
          </div>
        )}

        <div className="user-list">
          {users.map((u) => {
            const isSelected = u.id === selectedUserId;
            return (
              <button
                key={u.id}
                type="button"
                className={`user-item ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  setSelectedUserId(u.id);
                  setErrorMsg(null);
                }}
              >
                <div className="avatar">{u.name.charAt(0)}</div>
                <div className="user-info">
                  <p className="user-name">{u.name}</p>
                  <p className="user-email">{u.email}</p>
                </div>
                <span className={`badge ${u.role === 'ADMIN' ? 'admin' : ''}`}>
                  {u.role === 'ADMIN' ? 'Admin' : u.role === 'OPERATOR' ? 'Operador' : 'Auditor'}
                </span>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="password-section">
          <div className="input-group">
            <label>Senha de acesso para {selectedUser?.name || 'o Usuário'}</label>
            <input
              type="password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrorMsg(null);
              }}
              autoFocus
            />
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Validando senha...' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="login-footer">
          Cada usuário possui sua própria senha individual de acesso.
        </div>
        
      </div>
    </div>
  );
};
