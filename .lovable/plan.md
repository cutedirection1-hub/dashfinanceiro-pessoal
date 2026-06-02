## 1. "Sem categoria" aparecendo e sumindo no refresh (Cartões)

**Causa:** Em `src/routes/_authenticated/cartoes.tsx` as duas queries são independentes — `cartoes` (transações) carrega imediatamente, mas `categories` só é habilitada quando `user?.id` existe e leva mais tempo. Nesse intervalo, `catMap[t.category_id]` retorna `undefined` → o item é renderizado como "Sem categoria" no gráfico/lista. Quando as categorias chegam, a UI rerenderiza correta.

**Fix:** No componente da página, não renderizar a lista/gráfico de fatura enquanto `cats === undefined` (mostrar skeleton ou apenas aguardar). Alternativamente, ocultar/agrupar a fatia "Sem categoria" enquanto `cats` não carregou. Vou usar o gating por `cats !== undefined` no bloco da fatura para evitar flash.

## 2. Refresh manda para `/login` mesmo logado

**Causa:** Em `src/routes/_authenticated.tsx`, o `beforeLoad` chama `supabase.auth.getSession()` durante SSR/prerender — onde não existe `localStorage` — e recebe `null`, disparando `redirect({ to: "/login" })`. No client, a sessão só é restaurada após hidratação.

**Fix:** Remover o `beforeLoad` server-side e fazer a checagem apenas no client (já existe um `useEffect` em `AuthenticatedLayout` que faz `navigate({ to: "/login" })` quando `!user` após o `useAuth` carregar). O guard fica client-only, evitando o falso redirect no refresh. (O `useAuth` já usa `getSession()` + `onAuthStateChange` corretamente.)

Alternativa mais segura: manter o guard mas marcar a rota com `ssr: false` para que `beforeLoad` rode só no client com `localStorage` disponível.

→ Vou usar `ssr: false` na rota `_authenticated` (mantém o redirect server-style sem rodar no prerender).

## 3. Botão global de "esconder valores"

**Hoje:** existe só em `investimentos.tsx` como state local.

**Fix:** Criar contexto compartilhado `src/hooks/use-hidden-values.tsx` com:
- `useState` persistido em `localStorage` (`hide-values:v1`)
- Provider montado no layout `_authenticated.tsx`
- Hook `useHiddenValues()` → `{ hidden, toggle }`
- Helper `maskBrl(value, hidden)` que retorna `"R$ ••••"` quando ativo

Adicionar botão (ícone `Eye` / `EyeOff`) no header de cada página: Dashboard, Contas, Cartões, Investimentos. Trocar `brl(x)` por `maskBrl(x, hidden)` nos pontos visíveis: cards de totais, fatura, listas, gráficos (tooltip values).

Em `investimentos.tsx`, substituir o state local pelo hook compartilhado.

## Arquivos a alterar

- `src/routes/_authenticated.tsx` — `ssr: false` + montar `HiddenValuesProvider`
- `src/routes/_authenticated/cartoes.tsx` — gate por `cats !== undefined`; botão hide; `maskBrl`
- `src/routes/_authenticated/contas.tsx` — botão hide; `maskBrl`
- `src/routes/_authenticated/dashboard.tsx` — botão hide; `maskBrl`
- `src/routes/_authenticated/investimentos.tsx` — substituir state por hook compartilhado
- `src/hooks/use-hidden-values.tsx` — novo
- `src/lib/format.ts` — exportar `maskBrl`
