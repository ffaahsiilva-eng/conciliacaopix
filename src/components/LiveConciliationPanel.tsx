import React, { useEffect, useState, useRef } from 'react';
import { Lock, User, Clock, AlertTriangle, X, Eye, Activity, ShieldCheck, KeyRound } from 'lucide-react';
import { subscribeToRealtimeEvents } from '../services/api';
import { formatCurrency, formatDateTime } from '../services/api';

export interface LiveLockInfo {
  transactionId: string;
  description?: string;
  amount?: number;
  driverName?: string | null;
  lockedByUserId: string;
  lockedByUserName: string;
  lockedAt: string;
  expiresAt: number;
}

export interface LiveSessionInfo {
  sessionId: string;
  driverName: string;
  driverPlate?: string | null;
  operatorUserId: string;
  operatorUserName: string;
  startedAt: string;
  totalItems?: number;
  totalAmount?: number;
}

interface LiveConciliationPanelProps {
  currentUserId?: string;
}

/**
 * Painel flutuante persistente que mostra em tempo real:
 *  - Conciliações (sessões de motorista) iniciadas por outros usuários.
 *  - Transações (PIX / Cobranças) bloqueadas por outros usuários.
 *
 * O aviso permanece visível enquanto o bloqueio estiver ativo, desaparecendo
 * automaticamente quando o item for liberado.
 */
export const LiveConciliationPanel: React.FC<LiveConciliationPanelProps> = ({ currentUserId }) => {
  const [sessions, setSessions] = useState<LiveSessionInfo[]>([]);
  const [locks, setLocks] = useState<LiveLockInfo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(false);
  const hasUnseen = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToRealtimeEvents((event) => {
      if (event.type === 'RECONCILIATION_SESSION_STARTED') {
        const s = event.payload?.session;
        if (!s || s.status !== 'IN_PROGRESS') return;
        setSessions((prev) => {
          if (prev.some((p) => p.sessionId === s.id)) return prev;
          return [
            ...prev,
            {
              sessionId: s.id,
              driverName: s.driver_name,
              driverPlate: s.driver_plate,
              operatorUserId: s.operator_user_id,
              operatorUserName: s.operator_user_name,
              startedAt: s.started_at,
              totalItems: s.total_items,
              totalAmount: s.total_amount
            }
          ];
        });
      } else if (event.type === 'RECONCILIATION_SESSION_DELETED' || event.type === 'RECONCILIATION_COMPLETED') {
        const sid = event.payload?.sessionId || event.payload?.session?.id;
        if (sid) setSessions((prev) => prev.filter((p) => p.sessionId !== sid));
        if (event.type === 'RECONCILIATION_COMPLETED') {
          // limpar locks dessa sessão
          setLocks((prev) => prev.filter((l) => l.expiresAt > 0));
        }
      } else if (event.type === 'TRANSACTIONS_LOCKED') {
        const p = event.payload || {};
        const lockedByUserId = p.lockedByUserId;
        const lockedByUserName = p.lockedByUserName;
        const ids: string[] = p.transactionIds || [];
        if (!lockedByUserId || !ids.length) return;
        const lockedAtIso = new Date().toISOString();
        const expiresAt = now + 30 * 60 * 1000; // 30 min
        setLocks((prev) => {
          const next = [...prev];
          for (const id of ids) {
            const existingIdx = next.findIndex((l) => l.transactionId === id);
            const info: LiveLockInfo = {
              transactionId: id,
              description: p.descriptions?.[id] || prev.find((l) => l.transactionId === id)?.description,
              amount: p.amounts?.[id] || prev.find((l) => l.transactionId === id)?.amount,
              driverName: p.driverName ?? null,
              lockedByUserId,
              lockedByUserName,
              lockedAt: lockedAtIso,
              expiresAt
            };
            if (existingIdx >= 0) next[existingIdx] = info;
            else next.push(info);
          }
          return next;
        });
      } else if (event.type === 'TRANSACTIONS_UNLOCKED') {
        const ids: string[] = event.payload?.transactionIds || [];
        if (!ids.length) return;
        const idSet = new Set(ids);
        setLocks((prev) => prev.filter((l) => !idSet.has(l.transactionId)));
      }
    });

    return () => unsubscribe();
  }, [now]);

  // Limpar locks expirados (mais de 30 min)
  useEffect(() => {
    setLocks((prev) => prev.filter((l) => l.expiresAt > now));
  }, [now]);

  const otherSessions = sessions.filter((s) => s.operatorUserId !== currentUserId);
  const otherLocks = locks.filter((l) => l.lockedByUserId !== currentUserId);

  const visibleSessions = otherSessions;
  const visibleLocks = otherLocks.slice(0, 8);

  const totalCount = visibleSessions.length + visibleLocks.length;
  if (totalCount === 0) return null;

  const formatElapsed = (iso: string) => {
    const diff = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
    if (diff < 60) return `${diff}s atrás`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    return `${Math.floor(diff / 3600)}h atrás`;
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-6 right-6 z-[150] bg-red-600 hover:bg-red-700 text-white rounded-full shadow-2xl px-4 py-3 flex items-center gap-2 animate-pulse-slow cursor-pointer border-2 border-white"
        title="Existem usuários trabalhando em conciliações. Clique para ver detalhes."
      >
        <AlertTriangle className="w-5 h-5" />
        <span className="font-bold text-sm">{totalCount} aviso{totalCount > 1 ? 's' : ''}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-[150] w-96 max-w-[calc(100vw-3rem)] bg-white rounded-2xl shadow-2xl border-2 border-red-300 overflow-hidden animate-fade-in-up">
      <div className="bg-gradient-to-r from-red-600 to-orange-600 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <Activity className="w-5 h-5 animate-pulse" />
          <h3 className="font-bold text-sm">Conciliação em Tempo Real</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {totalCount}
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10"
            title="Minimizar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto bg-slate-50">
        {/* Sessões ativas de outros usuários */}
        {visibleSessions.length > 0 && (
          <div className="p-3 border-b border-slate-200 bg-amber-50/50">
            <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              Conciliações em andamento
            </h4>
            {visibleSessions.map((s) => (
              <div
                key={s.sessionId}
                className="bg-white rounded-lg border border-amber-200 p-3 mb-2 last:mb-0 shadow-2xs"
              >
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {s.operatorUserName}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Está conciliando para o motorista:
                    </p>
                    <p className="text-sm font-bold text-amber-800 truncate">
                      {s.driverName}
                      {s.driverPlate ? (
                        <span className="ml-1 text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                          {s.driverPlate}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Iniciada {formatElapsed(s.startedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Locks ativos de outros usuários */}
        {visibleLocks.length > 0 && (
          <div className="p-3">
            <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              Itens bloqueados para você
            </h4>
            {visibleLocks.map((l) => (
              <div
                key={l.transactionId}
                className="bg-white rounded-lg border border-red-200 p-3 mb-2 last:mb-0 shadow-2xs"
              >
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 bg-red-100 text-red-700 rounded-full flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {l.lockedByUserName}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      está usando o PIX/Cobrança:
                    </p>
                    {l.description ? (
                      <p className="text-xs text-slate-700 truncate" title={l.description}>
                        {l.description}
                      </p>
                    ) : null}
                    {typeof l.amount === 'number' ? (
                      <p className="text-sm font-bold text-red-700">
                        {formatCurrency(l.amount)}
                      </p>
                    ) : null}
                    {l.driverName ? (
                      <p className="text-xs text-amber-700 truncate">
                        Para: {l.driverName}
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Bloqueado {formatElapsed(l.lockedAt)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {otherLocks.length > visibleLocks.length && (
              <p className="text-xs text-slate-500 text-center mt-2 italic">
                +{otherLocks.length - visibleLocks.length} outros bloqueios
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-slate-100 px-3 py-2 text-xs text-slate-500 text-center border-t border-slate-200">
        Você não pode selecionar itens bloqueados. Aguarde a liberação.
      </div>
    </div>
  );
};

/**
 * Modal grande e detalhado que aparece quando o usuário tenta
 * selecionar/conciliar um item que está bloqueado por outro.
 */
interface BlockDetailedModalProps {
  open: boolean;
  onClose: () => void;
  blockedByUserName: string;
  description?: string;
  amount?: number;
  lockedAt?: string;
  /** Admin-only: dispara desbloqueio forçado. */
  onAdminForceUnlock?: () => Promise<void> | void;
  /** Admin-only: desbloqueia e já bloqueia para si mesmo em seguida. */
  onAdminForceTakeOver?: () => Promise<void> | void;
  /** Indica se o usuário atual tem permissão de admin. */
  isAdmin?: boolean;
  /** Estado de carregamento dos botões admin. */
  adminLoading?: boolean;
}

export const BlockDetailedModal: React.FC<BlockDetailedModalProps> = ({
  open,
  onClose,
  blockedByUserName,
  description,
  amount,
  lockedAt,
  onAdminForceUnlock,
  onAdminForceTakeOver,
  isAdmin,
  adminLoading
}) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  if (!open) return null;

  const elapsed = lockedAt
    ? Math.max(0, Math.floor((now - new Date(lockedAt).getTime()) / 1000))
    : 0;
  const elapsedStr =
    elapsed < 60
      ? `${elapsed} segundo${elapsed !== 1 ? 's' : ''}`
      : elapsed < 3600
      ? `${Math.floor(elapsed / 60)} minuto${Math.floor(elapsed / 60) !== 1 ? 's' : ''}`
      : `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}min`;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="bg-gradient-to-br from-red-600 to-orange-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Item Indisponível</h3>
              <p className="text-sm text-red-100">
                Outra pessoa está usando este PIX / Cobrança agora.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4">
            <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1">
              Bloqueado por
            </p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">
                {blockedByUserName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{blockedByUserName}</p>
                <p className="text-xs text-slate-500">Usuário ativo nesta empresa</p>
              </div>
            </div>
          </div>

          {description ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Item
              </p>
              <p className="text-sm text-slate-800 font-medium">{description}</p>
              {typeof amount === 'number' ? (
                <p className="text-xl font-bold text-emerald-700 mt-1">
                  {formatCurrency(amount)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-amber-800">
            <Clock className="w-4 h-4 shrink-0" />
            <p className="text-xs">
              Bloqueado há <strong>{elapsedStr}</strong>. O item será liberado
              automaticamente quando o usuário desmarcar ou finalizar a conciliação.
            </p>
          </div>

          <div className="text-xs text-slate-500 leading-relaxed">
            <p className="font-bold text-slate-700 mb-1">
              Por que esse bloqueio existe?
            </p>
            <p>
              Cada PIX ou Cobrança só pode estar em uso por <strong>um usuário por
              vez</strong>. Enquanto {blockedByUserName} estiver com este item
              selecionado ou editando, ninguém mais pode conciliá-lo para evitar
              conflitos e duplicidade de comprovantes.
            </p>
          </div>

          {isAdmin && (onAdminForceUnlock || onAdminForceTakeOver) ? (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  Opções de Administrador
                </p>
              </div>
              <p className="text-xs text-amber-800 mb-3 leading-snug">
                Como <strong>ADMIN</strong>, você pode liberar este item. A ação
                será registrada na auditoria do sistema.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                {onAdminForceUnlock ? (
                  <button
                    type="button"
                    onClick={onAdminForceUnlock}
                    disabled={adminLoading}
                    title="Apenas libera o item (o outro usuário será notificado em tempo real)"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:cursor-wait"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Desbloquear</span>
                  </button>
                ) : null}
                {onAdminForceTakeOver ? (
                  <button
                    type="button"
                    onClick={onAdminForceTakeOver}
                    disabled={adminLoading}
                    title="Desbloqueia o item e já bloqueia para você"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:cursor-wait"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Desbloquear e Conciliar</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-colors cursor-pointer"
          >
            Entendi, vou aguardar
          </button>
        </div>
      </div>
    </div>
  );
};