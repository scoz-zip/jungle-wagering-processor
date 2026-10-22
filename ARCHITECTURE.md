# Architecture decisions

## Scope and boundaries

- `Money`: value object com aritmética decimal exata, sem dependência de NestJS/ORM.
- `WalletService`: abertura e consulta de wallet, ledger e reconciliação.
- `WagerService`: valida e processa transações financeiras.
- Controllers: adaptam HTTP para os serviços.
- PostgreSQL: fonte de verdade para saldo, idempotência, ledger e outbox.

## Concurrency

O serviço abre uma transação SQL e bloqueia a wallet com `SELECT ... FOR UPDATE`. Assim, movimentações que disputam a mesma wallet são serializadas pelo PostgreSQL, inclusive entre processos diferentes. Wallets diferentes continuam podendo ser processadas em paralelo. A constraint de saldo não negativo está no ledger, mas uma constraint adicional de `wallets.balance >= 0` deve ser adicionada em uma migration antes de uma versão final.

## Idempotency

O header `Idempotency-Key` é obrigatório. O payload de negócio é serializado em ordem de chaves definida e hash SHA-256. A chave é única no banco; a mesma chave e hash retorna o resultado persistido, e payload diferente resulta em conflito. A garantia depende do índice único persistente, não de memória.

## Money

A API recebe strings decimais. `decimal.js` realiza a aritmética; PostgreSQL armazena em `NUMERIC(20,2)`. Valores com notação científica, sinal negativo ou mais de duas casas são rejeitados pela factory `Money`.

## Events

O evento é gravado na tabela `outbox_messages` dentro da transação financeira. Isso impede evento de negócio sem registro confirmado no banco. O publisher SQS está presente como serviço inicial; ele precisa ser promovido a worker contínuo com locking/lease e cobertura de concorrência antes de uso real.

## Authentication

Autenticação não foi implementada, conforme permitido no desafio. Em ambiente real, usar Identity Provider OIDC (por exemplo, Keycloak) e um guard que valide o token. A API local é somente para desenvolvimento.
