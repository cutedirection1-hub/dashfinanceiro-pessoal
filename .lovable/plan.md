# Finalizar: arquivar investimentos

A coluna "arquivado" já existe no banco. Falta terminar a parte visual e os cálculos.

## Mudanças

1. **Aba Investimentos**
   - Botão de arquivar/desarquivar em cada ativo, ao lado de editar/excluir.
   - Ativos arquivados não entram nos totais (Patrimônio, Aportado, Resultado) nem no gráfico de Alocação.
   - Opção "Mostrar arquivados" para ver e reativar ativos arquivados, que aparecem esmaecidos.
   - Por padrão a lista mostra só os ativos que não estão arquivados.

2. **Dashboard**
   - O Patrimônio e o gráfico de evolução dos investimentos passam a somar só investimentos não arquivados.

## Detalhes técnicos
- `investimentos.tsx`: `archiveMut` faz `update({ archived })` e invalida `["inv"]` e `["dashboard"]`; estado `showArchived`; totais e alocação filtram por `!archived`.
- `dashboard.tsx`: query de investments com `.eq("archived", false)`.
- Não é preciso mudar o banco nem as regras de acesso.
