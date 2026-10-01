import React, { createContext, useContext, useState, useEffect } from 'react';
import { Company } from '../types';
import { api, subscribeToRealtimeEvents } from '../services/api';
import { useAuth } from './AuthContext';

interface CompanyContextType {
  companies: Company[];
  currentCompany: Company;
  setCurrentCompany: (company: Company | string) => void;
  availableCompanies: Company[];
  canSwitchCompany: boolean;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
}

const DEFAULT_COMPANY: Company = {
  id: 'matriz',
  name: 'Matriz (Sede Principal)',
  code: 'MATRIZ',
  cnpj: '00.000.000/0001-00',
  color: '#2563eb',
  is_main: 1,
  active: 1,
  created_at: new Date().toISOString()
};

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([DEFAULT_COMPANY]);
  const [currentCompany, setCurrentCompanyState] = useState<Company>(DEFAULT_COMPANY);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const data = await api.getCompanies();
      if (data && data.length > 0) {
        setCompanies(data);
      }
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // Compute available companies for the current logged in user
  const availableCompanies = React.useMemo(() => {
    if (!currentUser) return [DEFAULT_COMPANY];
    
    // If user has explicit allowed_companies list
    const allowed = currentUser.allowed_companies;
    if (allowed && Array.isArray(allowed) && allowed.length > 0) {
      const filtered = companies.filter((c) => allowed.includes(c.id) || allowed.includes(c.code.toLowerCase()));
      return filtered.length > 0 ? filtered : [DEFAULT_COMPANY];
    }

    // Default: admins get all companies, regular users get all or matriz
    return companies.length > 0 ? companies : [DEFAULT_COMPANY];
  }, [currentUser, companies]);

  // When currentUser or companies change, ensure selected company is valid for the user
  useEffect(() => {
    if (availableCompanies.length === 0) return;

    const savedCompanyId = localStorage.getItem('conciliapix_selected_company');
    const matchedSaved = availableCompanies.find((c) => c.id === savedCompanyId);

    if (matchedSaved) {
      setCurrentCompanyState(matchedSaved);
      api.setGlobalCompanyId(matchedSaved.id);
    } else {
      // Pick first allowed company (prefer Matriz if available)
      const defaultPick = availableCompanies.find((c) => c.is_main === 1) || availableCompanies[0];
      setCurrentCompanyState(defaultPick);
      localStorage.setItem('conciliapix_selected_company', defaultPick.id);
      api.setGlobalCompanyId(defaultPick.id);
    }
  }, [availableCompanies, currentUser]);

  const setCurrentCompany = (companyOrId: Company | string) => {
    const targetId = typeof companyOrId === 'string' ? companyOrId : companyOrId.id;
    const target = availableCompanies.find((c) => c.id === targetId);

    if (target) {
      setCurrentCompanyState(target);
      localStorage.setItem('conciliapix_selected_company', target.id);
      api.setGlobalCompanyId(target.id);
    }
  };

  return (
    <CompanyContext.Provider
      value={{
        companies,
        currentCompany,
        setCurrentCompany,
        availableCompanies,
        canSwitchCompany: availableCompanies.length > 1,
        loading,
        refreshCompanies: fetchCompanies
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
};
