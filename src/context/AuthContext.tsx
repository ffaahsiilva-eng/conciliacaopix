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

      try {
        const me = await api.getMe();
        const fresh = data.find((u) => u.id === me.id && u.active === 1);
        if (fresh) {
          setCurrentUser(fresh);
        } else {
          setCurrentUser(null);
        }
      } catch {
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();

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
    // Cleanup de possíveis resquícios antigos no localStorage do usuário
    localStorage.removeItem('conciliapix_auth_user');
    sessionStorage.removeItem('conciliapix_auth_user');
    return res.user;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.error(err);
    }
    setCurrentUser(null);
    localStorage.removeItem('conciliapix_auth_user');
    sessionStorage.removeItem('conciliapix_auth_user');
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
