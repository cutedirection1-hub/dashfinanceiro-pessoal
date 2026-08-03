# Corrigir "-0,00" nos saldos das contas

## O que foi verificado

Conferi os saldos direto no banco: os valores agregados por conta estão corretos (Nubank, Inter, Mercado Pago, C6 = 0,00; Itaú = 1.370,26). Ou seja, não há erro na soma em si — o problema é de arredondamento na exibição.

As somas são feitas em JavaScript com números decimais, o que gera resíduos minúsculos (ex.: -0,0000000000001). Ao formatar em reais, isso vira **-0,00** em vez de 0,00.

## O que muda

1. Na formatação de moeda, arredondar sempre para centavos antes de exibir e tratar o zero negativo como zero — nenhum lugar do app mostrará "-0,00".
2. Como a correção fica no formatador compartilhado, vale para Contas, Dashboard, Cartões, Investimentos e Fatura PDF de uma vez.
3. Nas cores condicionais de Contas (saldo do filtro/valores negativos em vermelho), usar o valor já arredondado, para que um resíduo de centésimo de centavo não pinte um zero de vermelho.

## Detalhes técnicos

- `src/lib/format.ts`: em `brl`, aplicar `Math.round(n * 100) / 100` e normalizar `-0` (`n === 0 ? 0 : n`) antes do `Intl.NumberFormat`.
- `src/routes/_authenticated/contas.tsx`: comparar `filteredTotal`/saldos arredondados (`Math.round(v*100)/100 < 0`) ao escolher a classe `text-destructive`.
- Nenhuma mudança de dados ou de consulta: os totais já batem com o banco.
