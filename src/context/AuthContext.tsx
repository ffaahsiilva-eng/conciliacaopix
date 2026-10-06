import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, subscribeToRealtimeEvents } from '../services/api';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (emailOrId: string, password: string) => Promise<User>;
  logout: () => void;
  changePassword: (userId: string, currentPassword: string | undefined, newPassword: string) => Promise<void>;
  reloadUsers: () => Promise<void>;
  canReconcile: boolean;
  canManageUsers: boolean;
  canImport: boolean;
  canReopen: boolean;
  isAdmin: boolean;
  isAuditorOnly: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  /**
   * Carrega o usuário autenticado exclusivamente do cookie HttpOnly do servidor.
   * Se o cookie não existir ou estiver inválido, currentUser fica null.
   * Esta função é a única fonte de verdade para "quem está logado".
   */
  const fetchMe = async (): Promise<User | null> => {
    try {
      const me = await api.getMe();
      if (me && (me as any).active === 1) {
        setCurrentUser(me);
        return me;
      }
      setCurrentUser(null);
      return null;
    } catch {
      setCurrentUser(null);
      return null;
    }
  };

  useEffect(() => {
    // Hidratação: SEMPRE consulta o servidor sobre quem está logado.
    // Não usa cache local (localStorage/sessionStorage) — o cookie HttpOnly
    // é a única fonte de verdade, isolado por navegador/aba.
    (async () => {
      try {
        await fetchUsers();
        await fetchMe();
      } finally {
        setLoading(false);
      }
    })();

    // Listen for user changes in real-time
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (event.type === 'USERS_UPDATED') {
        fetchUsers();
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (emailOrId: string, password: string): Promise<User> => {
    const res = await api.login(emailOrId, password);
    setCurrentUser(res.user);
    // Limpa qualquer cache de identidade antiga que possa ter ficado
    // de uma versão anterior do app.
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    return res.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    }
    setCurrentUser(null);
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
  };

  const changePassword = async (userId: string, currentPassword: string | undefined, newPassword: string) => {
    await api.changePassword({
      userId,
      currentPassword,
      newPassword,
      actorUser: currentUser || undefined
    });
  };

  const role = currentUser?.role;
  const isAdmin = role === 'ADMIN';
  const canReconcile = role === 'ADMIN' || role === 'OPERATOR';
  const canManageUsers = role === 'ADMIN';
  const canImport = role === 'ADMIN' || role === 'OPERATOR';
  const canReopen = role === 'ADMIN';
  const isAuditorOnly = role === 'AUDITOR';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        login,
        logout,
        changePassword,
        reloadUsers: fetchUsers,
        canReconcile,
        canManageUsers,
        canImport,
        canReopen,
        isAdmin,
        isAuditorOnly,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
