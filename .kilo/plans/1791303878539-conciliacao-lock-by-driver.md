# Plano: Travar conciliação por motorista + corrigir lock inconsistente

## Objetivo

Garantir que (1) o lock por PIX/cobrança funcione de forma confiável sempre que um usuário marcar uma transação, e (2) a abertura de uma conciliação para um motorista já em uso por outro operador seja bloqueada com popup vermelho em tempo real, independente do role (admin/operador), sem permitir duas sessões ativas simultâneas para o mesmo motorista.

## Contexto (achados da auditoria)

Auditoria completa de locks (frontend + backend) revela:

- `ReconciliationSessionContext.toggleTransaction` e `selectMultiple` (src/context/ReconciliationSessionContextContext.tsx:103-166) já chamam `api.lockTransactions` antes de atualizar `selectedTxIds`. Caminho correto.
- `handleOpenTransactionView` (src/views/ReconciliationView.tsx:265-288) já chama `api.lockTransactions` com `action: 'DETAILS' | 'EDIT'` antes de abrir o modal. Caminho correto.
- `unlockAllByUser` é chamado em `App.tsx:71` (mudança de usuário/empresa) e via `sendBeacon` em `beforeunload` (ReconciliationSessionContext.tsx:91-100). Cobertura básica OK.
- O `SwitchUserModal` (src/components/SwitchUserModal.tsx:30-53) **não** chama `unlockAllByUser` antes do `login` — locks do usuário anterior vazam até fechar a aba. Bug menor, mas a corrigir.
- Servidor tem `BEGIN IMMEDIATE` em server.ts (lock atômico). Bom.
- `force: true` enviado por `api.lockTransactions` (src/services/api.ts:543) é ignorado pelo servidor. O takeover admin funciona só porque o front faz unlock+lock. OK do ponto de vista funcional, mas o flag é morto.
- O lock em `finishSession` (ReconciliationSessionContext.tsx:313-336) não é explicitamente liberado. Cosmético (linhas viram RECONCILED e o lock some no filtro).
- **Causa mais provável do "às vezes não bloqueia"**: race entre (a) o usuário A clicar no checkbox, (b) o lock local ser aplicado, e (c) o outro usuário B ter recebido o SSE `TRANSACTIONS_LOCKED` no momento certo. Como o servidor é fonte da verdade, a próxima ação do B que tente lockar cai em 409 — o badge local do B pode estar stale, mas o **mecanismo** está correto. Para a UX, vamos:
  - Tornar a aplicação do lock **otimista** (atualiza local imediatamente, e em caso de 409 reverte + mostra modal).
  - Refetch do lock badge do item clicado antes de abrir Details/Edit, se a info local estiver defasada.

## Decisões

- **Bloqueio por sessão**: Implementar trava de "uma sessão ativa por motorista". Enquanto existir `reconciliation_sessions` com `status='IN_PROGRESS'` e `driver_id = X`, qualquer outro usuário (admin ou operador) que tente iniciar uma sessão para o mesmo `X` recebe 409 com info de quem está conciliando, e o front abre o `BlockDetailedModal` vermelho.
- **Lock otimista no client**: ao marcar checkbox, o item é marcado localmente de imediato. Se o servidor retornar 409, reverter o estado local e abrir o modal.
- **`unlockAllByUser` no `SwitchUserModal`**: chamar antes do `login` do novo usuário.
- **`force: true` no servidor**: implementar de fato no servidor (admin toma lock sem precisar de unlock prévio) ou remover o campo do front. **Decisão: implementar no servidor** — é o comportamento que o `BlockDetailedModal` ("Desbloquear e Conciliar") já anuncia.

## Mudanças

### Servidor — `server.ts`

1. **`POST /api/reconciliation/start-session` (server.ts atual ≈:2013)**: rejeitar com 409 se já existir `reconciliation_sessions` com mesmo `driver_id`, `status='IN_PROGRESS'` e `operator_user_id != actorUser.id`. Payload do 409:
   ```json
   {
     "error": "Já existe uma conciliação em andamento para o motorista NOME por OPERADOR.",
     "blockedByUserName": "Nome do operador",
     "blockedByUserId": "usr-...",
     "driverId": "drv-...",
     "driverName": "Nome",
     "sessionId": "sess-...",
     "startedAt": "ISO"
   }
   ```
   Manter SSE `RECONCILIATION_SESSION_STARTED` para o caminho feliz (broadcast em ambos os casos: o criador recebe 201, demais recebem SSE).

2. **`POST /api/transactions/lock`**: implementar `force: true`. Quando `force=true` e `actorUser.role === 'ADMIN'`, sobrescrever o lock atual (audit `LOCK_FORCED_BY_ADMIN` já existe) e seguir. Manter a checagem de status `RECONCILED/IGNORED/RETURNED` mesmo com force (não dá pra reverter uma transação já processada por lock).

3. **Helper `getActiveSessionByDriver(driverId, companyId)`**: usado no endpoint de start e exposto via `GET /api/reconciliation/active-session-by-driver/:driverId` (ou incluído no payload de `getDrivers`) para o front poder mostrar o estado pré-clique no modal de "Nova Conciliação". **Decisão: incluir no `GET /api/drivers`** — adiciona `active_session` por motorista.

### Cliente

1. **`src/services/api.ts`**:
   - `startReconciliationSession` propaga `err.lockedByUserName/Id/sessionId/startedAt/driverName`.
   - `lockTransactions` já propaga o payload 409 estruturado.
   - Adicionar `force: true` opcional em `lockTransactions` (já existe via `options.force`).

2. **`src/context/ReconciliationSessionContext.tsx`**:
   - `toggleTransaction`: aplicar **otimismo** — marcar `selectedTxIds` antes do await. Em erro, reverter.
   - `startSession`: capturar 409 estruturado e abrir `BlockDetailedModal` com `transactionId: driverId` (reaproveitando o modal atual). O `handleAdminForceTakeOver` já tem o mesmo padrão.
   - Expor o `useReconciliationSession` com `startSessionError` opcional para o front.

3. **`src/components/StartSessionModal.tsx`**:
   - Mostrar o estado atual "Em uso por X desde HH:MM" ao lado de cada motorista (lido de `getDrivers().active_session`).
   - Se já há sessão ativa pelo próprio usuário para o motorista: bloquear o botão.
   - Em erro 409, abrir `BlockDetailedModal` (reaproveitar componente).

4. **`src/components/SwitchUserModal.tsx` (src/components/SwitchUserModal.tsx:30-53)**:
   - Antes de chamar `login(...)`, executar `api.unlockAllByUser(currentUser)` (fire-and-forget).

5. **`src/components/LiveConciliationPanel.tsx`**:
   - O `BlockDetailedModal` já cobre o caso. Adicionar suporte para `blockedByEntityKind: 'transaction' | 'driver'` para ajustar a mensagem ("Movimentação" vs "Motorista").

6. **`src/views/ReconciliationView.tsx` (linha 1022-1039)**:
   - No clique da linha durante sessão, manter o fluxo atual (que já bloqueia). Adicionar apenas o `await toggleTransaction` para garantir await real (já é await, confirmar).

## Validação

1. `npm run lint` deve passar sem erros.
2. **Smoke test backend (PowerShell + curl)** — reusar `jarA.txt`/`jarB.txt` (já testado antes):
   - Login como A (admin), `POST /api/reconciliation/start-session` para `driver_id=X` → 201.
   - Login como B (operator), `POST /api/reconciliation/start-session` para mesmo `driver_id=X` → 409 com `blockedByUserName=A`.
   - B tenta `POST /api/transactions/lock` para uma tx que A tem lockada → 409 (já funciona).
   - A (admin) chama `lockTransactions` com `force:true` para mesma tx → 200 + auditoria `LOCK_FORCED_BY_ADMIN`.

3. **Smoke test UI manual** (duas janelas anônimas):
   - Janela 1 (admin), janela 2 (operador). Janela 1 inicia conciliação para "Motorista X". Janela 2 tenta iniciar para mesmo motorista → modal vermelho central.
   - Janela 1 marca 3 PIX. Janela 2 tenta marcar um deles → modal vermelho com nome/descrição/valor.
   - Janela 1 faz hard refresh, perde sessão mas mantém lock → os 3 PIX continuam com lock para Janela 2 (verificar via `getTransactions`).
   - Trocar de usuário via dropdown (Janela 1) → locks devem ser liberados imediatamente (verificar via `unlockAllByUser`).

## Riscos

- **Quebra de sessão simultânea legítima**: se dois admins estiverem conciliando o mesmo motorista por motivos legítimos, o segundo não conseguirá. Mitigação: admin pode "forçar" via `force:true` (implementar em start-session também? ou abrir modal com botão "Assumir conciliação"?). **Decisão: não expor takeover de sessão agora**; se necessário, segunda iteração.
- **SSE de sessão criada pode chegar antes do 201 ao criador**: garantir que o broadcast `RECONCILIATION_SESSION_STARTED` só ocorra APÓS o INSERT ter commitado. O `BEGIN IMMEDIATE` + `COMMIT` já cobre, mas a chamada do broadcast deve ser fora da transação.

## Fora de escopo

- Refactor do `BEGIN IMMEDIATE` em `lock` — já está ok.
- Lock expirado / cleanup — já existe em `cleanupOrphanLocks`.
- Persistir lock no `finishSession` — cosmético, deixar.
- `force: true` no `startReconciliationSession` — segunda iteração, se necessário.

## Tarefas (ordem de execução)

1. Servidor: implementar trava em `start-session` (rejeitar 409 estruturado) + `force: true` em `lock`.
2. Servidor: incluir `active_session` no payload de `getDrivers`.
3. Cliente: `api.startReconciliationSession` propaga 409 estruturado.
4. Cliente: `toggleTransaction` otimismo + revert.
5. Cliente: `StartSessionModal` mostra "Em uso por" e abre `BlockDetailedModal` em conflito.
6. Cliente: `SwitchUserModal` chama `unlockAllByUser` antes do login.
7. `BlockDetailedModal` aceita `entityKind: 'transaction' | 'driver'`.
8. Reiniciar servidor, `npm run lint`, validar.

## Arquivos afetados

- `server.ts` (start-session, lock, getDrivers)
- `src/services/api.ts` (startReconciliationSession signature)
- `src/context/ReconciliationSessionContext.tsx` (otimismo no toggle, captura de erro estruturado no startSession)
- `src/components/StartSessionModal.tsx` (aviso "em uso" + modal)
- `src/components/SwitchUserModal.tsx` (unlockAllByUser)
- `src/components/LiveConciliationPanel.tsx` (entityKind no BlockDetailedModal)
- `src/views/ReconciliationView.tsx` (sem mudança grande; garantir await)
