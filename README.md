# Simulador MFV

Aplicação web para criar, comparar e imprimir cenários de Mapeamento de Fluxo de Valor (MFV).

## Recursos

- Estado atual como base sincronizada para vários cenários futuros, sem retorno das alterações
- Cadastro de processos, tempos, setup, lote, operadores, disponibilidade, qualidade, estoques e esperas
- Cálculo de takt time, capacidade efetiva, gargalo, perdas acumuladas e lead time
- Cenários rápidos de demanda, setup, disponibilidade, qualidade e recurso no gargalo
- Comparação Estado Atual × Estados Futuros com deltas de capacidade, atravessamento, WIP, operadores, qualidade e carga máxima
- Execução visual do fluxo com caixas em movimento, carregamento de caminhões, filas, WIP e orientação de gargalos
- Teste de estresse do Estado Futuro com turnos, intervalos, falha por processo, atraso de fornecedor e transporte, além de filas, bloqueios e identificação do momento da ruptura
- Biblioteca de símbolos e fluxos inspirada no padrão visual das planilhas MFV
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
