import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { api, formatDateTime } from '../services/api';
import {
  Users,
  UserPlus,
  ShieldCheck,
  CheckCircle,
  XCircle,
  Edit2,
  Lock,
  Mail,
  UserCheck,
  AlertCircle,
  Key,
  Building2,
  Store,
  Layers,
  Trash2,
  AlertTriangle,
  X
} from 'lucide-react';
import { SwitchUserModal } from '../components/SwitchUserModal';

type CompanyAccessOption = 'ALL' | 'MATRIZ_ONLY' | 'FILIAL_ONLY';

export const UsersView: React.FC = () => {
  const { users, currentUser, reloadUsers, canManageUsers } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [switchUserModalOpen, setSwitchUserModalOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  // Deletion state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [notificationMsg, setNotificationMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('OPERATOR');
  const [companyAccess, setCompanyAccess] = useState<CompanyAccessOption>('ALL');
  const [pin, setPin] = useState('1234');
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getCompanyAccessFromUser = (u: User): CompanyAccessOption => {
    const allowed = u.allowed_companies;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return 'ALL';
    const hasMatriz = allowed.includes('matriz');
    const hasFilial = allowed.includes('filial');
    if (hasMatriz && hasFilial) return 'ALL';
    if (hasMatriz && !hasFilial) return 'MATRIZ_ONLY';
    if (!hasMatriz && hasFilial) return 'FILIAL_ONLY';
    return 'ALL';
  };

  const getCompaniesArray = (opt: CompanyAccessOption): string[] => {
    switch (opt) {
      case 'ALL':
        return ['matriz', 'filial'];
      case 'MATRIZ_ONLY':
        return ['matriz'];
      case 'FILIAL_ONLY':
        return ['filial'];
    }
  };

  const handleOpenNew = () => {
    setUserToEdit(null);
    setName('');
    setEmail('');
    setRole('OPERATOR');
    setCompanyAccess('ALL');
    setPin('1234');
    setActive(true);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setUserToEdit(user);
    setName(user.name);
    setEmail(user.email);
    setRole(user.role);
    setCompanyAccess(getCompanyAccessFromUser(user));
    setPin(''); // Blank means do not change password
    setActive(user.active === 1);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleOpenDelete = (user: User) => {
    setUserToDelete(user);
    setDeleteError(null);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || !currentUser) return;

    try {
      setIsDeleting(true);
      setDeleteError(null);

      const res = await api.deleteUser(userToDelete.id, currentUser);
      await reloadUsers();
      
      setDeleteModalOpen(false);
      setUserToDelete(null);

      // Also close edit modal if opened from inside edit
      if (modalOpen && userToEdit?.id === userToDelete.id) {
        setModalOpen(false);
      }

      setNotificationMsg({
        type: 'success',
        text: res.message || 'Usuário excluído com sucesso do sistema.'
      });

      setTimeout(() => {
        setNotificationMsg(null);
      }, 5000);
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir usuário.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setErrorMsg('Nome e e-mail são obrigatórios.');
      return;
    }
    if (!userToEdit && !pin.trim()) {
      setErrorMsg('A senha de acesso é obrigatória para o novo usuário.');
      return;
    }
    if (!currentUser) return;

    try {
      setLoading(true);
      setErrorMsg(null);

      const allowedCompanies = getCompaniesArray(companyAccess);

      if (userToEdit) {
        await api.updateUser(
          userToEdit.id,
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            active: active ? 1 : 0,
            allowed_companies: allowedCompanies,
            ...(pin.trim() ? { pin: pin.trim() } : {})
          },
          currentUser
        );
      } else {
        await api.createUser(
          {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            role,
            pin: pin.trim(),
            allowed_companies: allowedCompanies
          },
          currentUser
        );
      }

      await reloadUsers();
      setModalOpen(false);

      setNotificationMsg({
        type: 'success',
        text: userToEdit ? 'Usuário atualizado com sucesso!' : 'Novo usuário cadastrado com sucesso!'
      });

      setTimeout(() => {
        setNotificationMsg(null);
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar usuário.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'ADMIN':
        return (
          <span className="bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-xs font-bold">
            Administrador
          </span>
        );
      case 'OPERATOR':
        return (
          <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-xs font-bold">
            Operador Conciliador
          </span>
        );
      case 'AUDITOR':
        return (
          <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-xs font-bold">
            Auditor Fiscal
          </span>
        );
    }
  };

  const getCompanyAccessBadge = (u: User) => {
    const access = getCompanyAccessFromUser(u);
    switch (access) {
      case 'ALL':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
            <Layers className="w-3 h-3 text-purple-600" />
            <span>Matriz + Filial</span>
          </span>
        );
      case 'MATRIZ_ONLY':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
            <Building2 className="w-3 h-3 text-blue-600" />
            <span>Apenas Matriz</span>
          </span>
        );
      case 'FILIAL_ONLY':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px] font-bold">
            <Store className="w-3 h-3 text-emerald-600" />
            <span>Apenas Filial</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {notificationMsg && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between animate-fade-in shadow-sm ${
            notificationMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center space-x-2 text-xs font-bold">
            {notificationMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{notificationMsg.text}</span>
          </div>
          <button
            onClick={() => setNotificationMsg(null)}
            className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <span>Controle de Usuários & Permissões por Unidade (Matriz / Filial)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Cadastre, edite, exclua e configure quais operadores têm acesso a cada empresa
          </p>
        </div>

        {canManageUsers && (
          <button
            onClick={handleOpenNew}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center space-x-2 transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        )}
      </div>

      {/* Role and Company explanation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white border border-purple-200 rounded-xl p-4 space-y-1.5 shadow-xs">
          <p className="font-bold text-purple-700 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-600" />
            <span>Acesso a Ambas Unidades</span>
          </p>
          <p className="text-slate-600">
            O operador visualiza a chave seletora no cabeçalho e pode alternar livremente entre os extratos da <strong>Matriz</strong> e da <strong>Filial</strong>.
          </p>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-4 space-y-1.5 shadow-xs">
          <p className="font-bold text-blue-700 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Acesso Apenas Matriz</span>
          </p>
          <p className="text-slate-600">
            O operador fica restrito exclusivamente aos lançamentos, motoristas e relatórios da <strong>Sede Principal</strong>.
          </p>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-4 space-y-1.5 shadow-xs">
          <p className="font-bold text-emerald-800 flex items-center gap-1.5">
            <Store className="w-4 h-4 text-emerald-600" />
            <span>Acesso Apenas Filial</span>
          </p>
          <p className="text-slate-600">
            O operador fica restrito exclusivamente às conciliações e cadastros da <strong>Filial 01</strong>, sem acesso à Matriz.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nome do Usuário</th>
                <th className="py-3.5 px-4">E-mail Corporativo</th>
                <th className="py-3.5 px-4">Nível de Permissão</th>
                <th className="py-3.5 px-4">Empresas Permitidas</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Data Cadastro</th>
                <th className="py-3.5 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isCurrent = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 whitespace-nowrap flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 text-blue-700 font-bold flex items-center justify-center text-xs">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <span>{u.name}</span>
                        {isCurrent && (
                          <span className="ml-2 text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.2 rounded font-bold">
                            Você
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 font-mono">{u.email}</td>
                    <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>
                    <td className="py-3.5 px-4">{getCompanyAccessBadge(u)}</td>
                    <td className="py-3.5 px-4 text-center">
                      {u.active === 1 ? (
                        <span className="inline-flex items-center text-emerald-700 font-bold gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Ativo</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-700 font-bold gap-1 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Inativo</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        {isCurrent ? (
                          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            Sessão Atual
                          </span>
                        ) : (
                          <button
                            onClick={() => setSwitchUserModalOpen(true)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                            title="Acessar com a senha deste usuário"
                          >
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>Acessar</span>
                          </button>
                        )}

                        {canManageUsers && (
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Editar cadastro / redefinir senha / alterar permissões de empresa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}

                        {canManageUsers && !isCurrent && (
                          <button
                            onClick={() => handleOpenDelete(u)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title={`Excluir usuário "${u.name}"`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Modal (Create / Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl text-slate-800 overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-extrabold text-slate-900">
                {userToEdit ? 'Editar Usuário & Permissões' : 'Novo Usuário do Sistema'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    E-mail Corporativo *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="joao.silva@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  />
                  {userToEdit && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Você pode alterar o e-mail corporativo utilizado para acesso deste usuário.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nível de Permissão (Função) *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 font-medium shadow-xs"
                  >
                    <option value="OPERATOR">Operador (Conciliação e Motoristas)</option>
                    <option value="ADMIN">Administrador (Acesso Completo + Auditoria)</option>
                    <option value="AUDITOR">Auditor Fiscal (Somente Leitura e Relatórios)</option>
                  </select>
                </div>

                {/* Company Permission Access */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Permissão de Acesso por Empresa / Unidade *
                  </label>
                  <div className="grid grid-cols-1 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <label
                      className={`flex items-start space-x-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                        companyAccess === 'ALL'
                          ? 'bg-purple-50/80 border-purple-300 text-purple-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="companyAccess"
                        value="ALL"
                        checked={companyAccess === 'ALL'}
                        onChange={() => setCompanyAccess('ALL')}
                        className="mt-0.5 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-purple-600" />
                          <span>Ambas as Empresas (Matriz e Filial)</span>
                        </div>
                        <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                          O operador pode trocar livremente entre Matriz e Filial na barra superior.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                        companyAccess === 'MATRIZ_ONLY'
                          ? 'bg-blue-50/80 border-blue-300 text-blue-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="companyAccess"
                        value="MATRIZ_ONLY"
                        checked={companyAccess === 'MATRIZ_ONLY'}
                        onChange={() => setCompanyAccess('MATRIZ_ONLY')}
                        className="mt-0.5 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Apenas Matriz (Sede Principal)</span>
                        </div>
                        <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                          O operador só visualiza e opera os lançamentos e motoristas da Matriz.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-2.5 p-2 rounded-lg border cursor-pointer transition-all ${
                        companyAccess === 'FILIAL_ONLY'
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="companyAccess"
                        value="FILIAL_ONLY"
                        checked={companyAccess === 'FILIAL_ONLY'}
                        onChange={() => setCompanyAccess('FILIAL_ONLY')}
                        className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Apenas Filial 01 (Unidade Filial)</span>
                        </div>
                        <p className="text-[11px] font-normal text-slate-500 mt-0.5">
                          O operador só visualiza e opera os lançamentos e motoristas da Filial.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    {userToEdit ? 'Redefinir Senha de Acesso (opcional):' : 'Senha de Acesso do Usuário *:'}
                  </label>
                  <input
                    type="password"
                    placeholder={userToEdit ? 'Deixe em branco para manter a senha atual' : 'Digite a senha inicial de acesso'}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required={!userToEdit}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-slate-900 focus:outline-none focus:border-blue-500 shadow-xs"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    {userToEdit
                      ? 'Preencha este campo caso queira alterar a senha deste operador.'
                      : 'O usuário precisará desta senha para entrar no sistema.'}
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="user-active"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-white border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="user-active" className="text-slate-700 font-bold cursor-pointer">
                    Usuário com acesso ativo
                  </label>
                </div>

                {errorMsg && (
                  <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-xs text-red-800">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <div>
                  {userToEdit && userToEdit.id !== currentUser?.id && (
                    <button
                      type="button"
                      onClick={() => handleOpenDelete(userToEdit)}
                      className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Excluir Usuário</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : userToEdit ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for User Deletion */}
      {deleteModalOpen && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-red-200 rounded-2xl w-full max-w-md shadow-2xl text-slate-800 overflow-hidden my-8 animate-fade-in">
            <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-red-600 text-white rounded-xl shadow-xs">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-red-950">
                    Confirmar Exclusão de Usuário
                  </h3>
                  <p className="text-[11px] text-red-700">Esta ação é irreversível</p>
                </div>
              </div>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-red-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Você tem certeza que deseja remover o usuário abaixo permanentemente do sistema?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Nome:</span>
                  <span className="font-extrabold text-slate-900">{userToDelete.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">E-mail:</span>
                  <span className="font-mono text-slate-800">{userToDelete.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Nível / Perfil:</span>
                  <span>{getRoleBadge(userToDelete.role)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Unidades:</span>
                  <span>{getCompanyAccessBadge(userToDelete)}</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  O histórico de auditoria e comprovantes gerados anteriormente por este usuário permanecerão salvos para fins de conformidade e fiscalização.
                </p>
              </div>

              {deleteError && (
                <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-center space-x-2 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Usuário'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch User Modal */}
      <SwitchUserModal
        isOpen={switchUserModalOpen}
        onClose={() => setSwitchUserModalOpen(false)}
      />
    </div>
  );
};
