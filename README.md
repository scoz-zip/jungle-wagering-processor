# Jungle Wagering Processor

Implementação inicial do desafio técnico Jungle Gaming. Projeto TypeScript/NestJS com Bun, PostgreSQL, TypeORM, precisão monetária via `decimal.js`, ledger e registro de eventos na outbox.

> **Estado da entrega:** esta é uma base funcional para desenvolvimento e validação, não uma declaração de conformidade total com o desafio. Antes de enviar, execute os testes e leia `LIMITATIONS.md`. A autenticação foi omitida conforme permitido pelo enunciado.

## Requisitos

- Bun 1.x
- Docker Desktop com Docker Compose
- Git

## Como iniciar no Windows

1. Copie `.env.example` para `.env` (PowerShell: `Copy-Item .env.example .env`).
2. Inicie PostgreSQL e LocalStack:
   ```powershell
   docker compose up -d
   ```
3. Instale dependências:
   ```powershell
   bun install
   ```
4. Inicie a API:
   ```powershell
   bun run start
   ```
5. API: `http://localhost:3000`; health: `GET /health/live`.

O TypeORM cria as tabelas ao iniciar (`synchronize: true`) para facilitar a avaliação local. Para produção, substituir por migrations versionadas antes de considerar a solução pronta.

## Endpoints

- `POST /wallets`
- `GET /wallets/:walletId`
- `GET /wallets/:walletId/ledger?limit=50`
- `POST /wallets/:walletId/reconciliation`
- `POST /wagering/transactions` (header obrigatório `Idempotency-Key`)
- `GET /wagering/transactions/:transactionId`
- `GET /providers/:providerId/wagering/transactions/:externalTransactionId`
- `GET /health/live`
- `GET /health/ready`

## Exemplo rápido (PowerShell)

Criar wallet:
```powershell
$body = @{
  playerId = "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1"
  initialBalance = @{ amount = "100.00"; currency = "BRL" }
} | ConvertTo-Json -Depth 5
$wallet = Invoke-RestMethod -Method Post -Uri http://localhost:3000/wallets -ContentType "application/json" -Body $body
$wallet
```

Aposta de R$ 25:
```powershell
$body = @{
  providerId = "provider-a"
  externalTransactionId = "transaction-123"
  playerId = $wallet.playerId
  walletId = $wallet.id
  roundId = "round-987"
  gameId = "fortune-chimp"
  kind = "BET"
  money = @{ amount = "25.00"; currency = "BRL" }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://localhost:3000/wagering/transactions -Headers @{ "Idempotency-Key" = "provider-a:transaction-123" } -ContentType "application/json" -Body $body
```

## Decisões principais

- `Money` recebe strings decimais e usa `decimal.js`; não converte valores monetários para `number`.
- `SELECT ... FOR UPDATE` via lock pessimista serializa movimentações da mesma wallet.
- A chave de idempotência e o identificador externo do provedor têm índices únicos no PostgreSQL.
- Wallet, transação, ledger e evento outbox são persistidos na mesma transação SQL.
- O saldo inicial gera operação `OPENING` e lançamento `CREDIT`.
- Reconciliação compara saldo materializado com soma do ledger.

Consulte `ARCHITECTURE.md` e `LIMITATIONS.md` antes da avaliação.

## Validações executadas

### Testes automatizados

Comando: `bun test`

- 3 testes passaram em `test/money.test.ts`:
  - Soma monetária sem depender de ponto flutuante.
  - Rejeição de valores com mais de duas casas decimais.
  - Rejeição de moedas diferentes.

Verificação de tipos: `bun run typecheck` — executada sem erros.

### Testes manuais da API

- Criação e consulta de carteiras.
- Aposta com saldo suficiente: transação processada e saldo atualizado.
- Repetição de requisição com a mesma chave de idempotência e mesmo payload: mesma transação retornada.
- Reutilização da chave de idempotência com payload diferente: HTTP 409.
- Aposta superior ao saldo disponível: rejeitada com `INSUFFICIENT_FUNDS`, sem débito no saldo.
- Duas apostas de R$ 40,00 enviadas em paralelo para uma carteira com R$ 50,00: uma processada e outra rejeitada por saldo insuficiente.
- Conferência do saldo e do ledger após o teste concorrente.
- Reconciliação da carteira: saldo armazenado de R$ 10,00, saldo calculado de R$ 10,00, diferença de R$ 0,00 e `consistent: true`.

Os cenários acima foram verificados manualmente pela API. Eles não substituem uma suíte automatizada de integração ou de concorrência.

Consulte `LIMITATIONS.md` para conhecer os requisitos ainda pendentes, especialmente o consumidor SQS/Inbox, migrations versionadas, recuperação de eventos e testes automatizados de concorrência.
