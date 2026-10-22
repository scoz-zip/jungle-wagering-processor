# Limitações conhecidas — leia antes de enviar

Este repositório é uma base de MVP para acelerar o início, não uma implementação integral de todos os requisitos do desafio.

1. **Migrations:** a configuração local usa `synchronize: true` para facilitar o boot. O desafio exige migrations versionadas e reversíveis; isso precisa ser substituído antes de alegar conformidade.
2. **SQS consumer / Inbox:** a fila é criada pelo LocalStack e existe publisher de outbox, mas ainda não há consumidor SQS completo com inbox persistente, ack pós-commit, redelivery, shutdown e DLQ validados.
3. **Publisher concorrente:** publisher inicial não implementa lease/`FOR UPDATE SKIP LOCKED`; não execute duas cópias como se a coordenação já estivesse garantida.
4. **Referências fora de ordem:** a API persiste `PENDING_REFERENCE`, mas o worker agendado com backoff/TTL ainda precisa ser concluído.
5. **Reversões:** validar comportamento de concorrência para reversões duplicadas; criar constraint de banco para impedir mais de uma reversão do mesmo tipo por referência.
6. **Imutabilidade:** ledger não tem endpoints de alteração/exclusão, mas permissões e triggers de imutabilidade no banco ainda não foram configurados.
7. **Validação HTTP:** os DTOs precisam de validação formal com `class-validator`; no momento há validações principais nos serviços, mas nem todo payload inválido foi coberto.
8. **Testes:** ainda precisam ser acrescentados testes de unidade, integração com containers reais e concorrência paralela. Não declare que os cenários obrigatórios passaram até executá-los.
9. **Observabilidade:** há health checks básicos e um log de falha do publisher; métricas obrigatórias e logging estruturado completo ainda não foram concluídos.
10. **Dinheiro:** validar `initialBalance` não negativo e escala. A factory `Money` rejeita valores negativos; valores com escala acima de 2 são rejeitados.
11. **Outbox:** o publisher é um esqueleto de integração, não um worker de produção.
12. **HTTP:** mapear com precisão os status para rejeições de negócio e falhas transitórias antes de entregar.

## Honestidade na apresentação

Explique o que está implementado, o que testou e o que ficou pendente. Não afirme que a solução satisfaz integralmente os requisitos distribuídos sem terminar e executar os testes exigidos.
