# Simulador MFV

Aplicação web para criar, comparar e imprimir cenários de Mapeamento de Fluxo de Valor (MFV).

## Recursos

- Estado atual e estado futuro independentes
- Cadastro de processos, tempos, setup, lote, operadores, disponibilidade e estoques
- Cálculo de takt time, capacidade, lead time e balanceamento
- Comparação entre cenários
- Salvamento local no navegador
- Relatório preparado para impressão ou PDF

## Desenvolvimento

```bash
pnpm install
pnpm run dev
```

Para validar a versão de produção:

```bash
pnpm run typecheck
pnpm run build
```
