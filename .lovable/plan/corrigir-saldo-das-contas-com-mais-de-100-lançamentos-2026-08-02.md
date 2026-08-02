# Corrigir saldo das contas com mais de 100 lançamentos

## O problema (confirmado)

Hoje a página Contas busca os lançamentos com um limite de 100 registros (só sobe para 1000 quando algum filtro está ativo). O saldo de cada conta e o "Saldo total" do cabeçalho são calculados somando **apenas os lançamentos carregados**.

O banco já tem 103 lançamentos no total (uma conta sozinha tem 46, outra 30). Ou seja, os saldos exibidos sem filtro já estão errados: lançamentos mais antigos ficam de fora e o saldo "anda" conforme se aplica ou remove filtros.

## O que muda

1. **Saldo calculado no banco, não na lista.** Somar receitas/despesas por conta via consulta agregada, independente de quantos lançamentos existam e de qualquer filtro/limite da lista. O saldo passa a ser `saldo inicial + total de entradas - total de saídas` de todos os lançamentos da conta.
2. **Saldo total** do cabeçalho passa a somar esses saldos completos.
3. **Lista de lançamentos** continua paginada/limitada (é só visualização), mas o rodapé/legenda deixa de sugerir que o saldo depende do que está listado; o "Saldo" mostrado junto aos filtros continua sendo o saldo do recorte filtrado, com rótulo claro ("Saldo do filtro").
4. **Sem filtro, subir o limite da lista** para o mesmo teto usado com filtro, evitando a impressão de lançamentos "sumindo".

## Detalhes técnicos

- Em `src/routes/_authenticated/contas.tsx`: nova query `["contas-saldos"]` que agrega por `account_id` (via RPC/consulta agregada ou paginação completa dos campos `account_id, amount, kind`), substituindo `balanceOf` baseado em `tx`.
- Invalidar essa query nas mutações existentes (criar/editar/excluir lançamento, excluir conta).
- Verificar `dashboard.tsx`: ele faz `select("*")` em `account_transactions` sem limite explícito, mas o teto padrão é 1000 linhas — incluir na mesma correção o cálculo agregado para evitar o mesmo bug quando o volume crescer.
