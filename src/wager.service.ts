import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { Money } from './domain/money';
import { Wallet } from './database/entities/wallet.entity';
import { WagerTransaction } from './database/entities/wager-transaction.entity';
import { LedgerEntry } from './database/entities/ledger-entry.entity';
import { OutboxMessage } from './database/entities/outbox-message.entity';

type SubmitWager = {
  providerId: string; externalTransactionId: string; playerId: string;
  walletId: string; roundId: string; gameId: string;
  kind: 'BET' | 'WIN' | 'LOSS' | 'REFUND' | 'ROLLBACK';
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
};

@Injectable()
export class WagerService {
  constructor(private readonly dataSource: DataSource) {}

  private canonicalHash(input: SubmitWager): string {
    const canonical = {
      gameId: input.gameId, kind: input.kind, money: input.money,
      playerId: input.playerId, providerId: input.providerId,
      referenceExternalTransactionId: input.referenceExternalTransactionId ?? null,
      roundId: input.roundId, walletId: input.walletId,
      externalTransactionId: input.externalTransactionId,
    };
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  async submit(input: SubmitWager, idempotencyKey?: string) {
    if (!idempotencyKey?.trim()) throw new BadRequestException('Header Idempotency-Key é obrigatório');
    if (!['BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'].includes(input.kind)) throw new BadRequestException('Tipo de operação inválido');
    if (['REFUND', 'ROLLBACK'].includes(input.kind) && !input.referenceExternalTransactionId) {
      throw new BadRequestException('Esta operação exige referenceExternalTransactionId');
    }
    const money = Money.from(input.money);
    if (!money.isPositive()) throw new BadRequestException('Valor da operação deve ser maior que zero');
    const payloadHash = this.canonicalHash(input);
    const key = idempotencyKey.trim();

    try {
      return await this.dataSource.transaction(async manager => {
        const txRepo = manager.getRepository(WagerTransaction);
        const existing = await txRepo.findOneBy({ idempotencyKey: key });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_CONFLICT');
          return this.response(existing, true);
        }

        const wallet = await manager.getRepository(Wallet).createQueryBuilder('w')
          .setLock('pessimistic_write').where('w.id = :id', { id: input.walletId }).getOne();
        if (!wallet) throw new NotFoundException('Wallet não encontrada');
        if (wallet.playerId !== input.playerId) throw new BadRequestException('PLAYER_WALLET_MISMATCH');
        if (wallet.currency !== money.currency) throw new BadRequestException('CURRENCY_MISMATCH');

        const transaction = txRepo.create({
          providerId: input.providerId, externalTransactionId: input.externalTransactionId,
          idempotencyKey: key, payloadHash, walletId: wallet.id, playerId: input.playerId,
          roundId: input.roundId, gameId: input.gameId, kind: input.kind,
          amount: money.toString(), currency: money.currency, status: 'PENDING',
          referenceExternalTransactionId: input.referenceExternalTransactionId,
        });
        await txRepo.save(transaction);

        let reference: WagerTransaction | null = null;
        if (input.kind === 'REFUND' || input.kind === 'ROLLBACK') {
          reference = await txRepo.findOneBy({
            providerId: input.providerId,
            externalTransactionId: input.referenceExternalTransactionId!,
          });
          if (!reference) {
            transaction.status = 'PENDING_REFERENCE';
            transaction.failureCode = 'REFERENCE_NOT_FOUND';
            await txRepo.save(transaction);
            await this.enqueue(manager, transaction, 'WagerTransactionPendingReference', wallet.balance);
            return this.response(transaction, false, wallet.balance);
          }
          if (reference.walletId !== wallet.id || reference.playerId !== input.playerId || reference.roundId !== input.roundId || reference.currency !== money.currency) {
            transaction.status = 'REJECTED';
            transaction.failureCode = 'REFERENCE_CONTEXT_MISMATCH';
            transaction.processedAt = new Date();
            await txRepo.save(transaction);
            await this.enqueue(manager, transaction, 'WagerTransactionRejected', wallet.balance);
            return this.response(transaction, false, wallet.balance);
          }
          if (input.kind === 'REFUND' && reference.kind !== 'BET') {
            transaction.status = 'REJECTED'; transaction.failureCode = 'REFUND_REQUIRES_BET';
          } else if (input.kind === 'ROLLBACK' && !['BET', 'WIN', 'REFUND'].includes(reference.kind)) {
            transaction.status = 'REJECTED'; transaction.failureCode = 'ROLLBACK_REFERENCE_KIND_INVALID';
          } else if (reference.status !== 'PROCESSED') {
            transaction.status = 'REJECTED'; transaction.failureCode = 'REFERENCE_NOT_PROCESSED';
          } else if (Money.from({ amount: reference.amount, currency: reference.currency }).equals(money) === false) {
            transaction.status = 'REJECTED'; transaction.failureCode = 'REFERENCE_AMOUNT_MISMATCH';
          } else {
            const alreadyReversed = await txRepo.findOne({
              where: { referenceTransactionId: reference.id, kind: input.kind, status: 'PROCESSED' },
            });
            if (alreadyReversed) {
              transaction.status = 'REJECTED'; transaction.failureCode = 'REFERENCE_ALREADY_REVERSED';
            } else {
              transaction.referenceTransactionId = reference.id;
            }
          }
          if (transaction.status === 'REJECTED') {
            transaction.processedAt = new Date();
            await txRepo.save(transaction);
            await this.enqueue(manager, transaction, 'WagerTransactionRejected', wallet.balance);
            return this.response(transaction, false, wallet.balance);
          }
        }

        const before = Money.from({ amount: wallet.balance, currency: wallet.currency });
        let after = before;
        let direction: 'DEBIT' | 'CREDIT' | undefined;
        if (input.kind === 'BET') {
          after = before.subtract(money); direction = 'DEBIT';
          if (after.isNegative()) {
            transaction.status = 'REJECTED'; transaction.failureCode = 'INSUFFICIENT_FUNDS';
          }
        } else if (input.kind === 'WIN' || input.kind === 'REFUND') {
          after = before.add(money); direction = 'CREDIT';
        } else if (input.kind === 'ROLLBACK') {
          if (reference?.kind === 'BET') { after = before.add(money); direction = 'CREDIT'; }
          else if (reference?.kind === 'WIN' || reference?.kind === 'REFUND') {
            after = before.subtract(money); direction = 'DEBIT';
            if (after.isNegative()) {
              transaction.status = 'REJECTED'; transaction.failureCode = 'REVERSAL_WOULD_OVERDRAW';
            }
          }
        }

        if (transaction.status !== 'REJECTED') {
          const changed = direction !== undefined;
          if (changed) {
            wallet.balance = after.toString();
            wallet.version += 1;
            await manager.getRepository(Wallet).save(wallet);
            await manager.getRepository(LedgerEntry).save(manager.getRepository(LedgerEntry).create({
              walletId: wallet.id, transactionId: transaction.id, direction: direction!,
              amount: money.toString(), balanceBefore: before.toString(), balanceAfter: after.toString(),
            }));
          }
          transaction.status = 'PROCESSED';
          transaction.processedAt = new Date();
          transaction.responseBalance = after.toString();
          await txRepo.save(transaction);
          await this.enqueue(manager, transaction, 'WagerTransactionProcessed', after.toString());
          if (changed) await this.enqueue(manager, transaction, 'WalletBalanceChanged', after.toString(), {
            walletId: wallet.id, transactionId: transaction.id, direction, money: money.toJSON(),
            balanceBefore: before.toJSON(), balanceAfter: after.toJSON(), walletVersion: wallet.version,
          });
        } else {
          transaction.processedAt = new Date();
          transaction.responseBalance = before.toString();
          await txRepo.save(transaction);
          await this.enqueue(manager, transaction, 'WagerTransactionRejected', before.toString());
        }
        return this.response(transaction, false, transaction.responseBalance ?? wallet.balance);
      });
    } catch (error: any) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (error?.code === '23505') {
        const existing = await this.dataSource.getRepository(WagerTransaction).findOneBy({ idempotencyKey: key });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ConflictException('IDEMPOTENCY_KEY_PAYLOAD_CONFLICT');
          return this.response(existing, true);
        }
        throw new ConflictException('Transação duplicada: providerId + externalTransactionId já existe');
      }
      throw error;
    }
  }

  async getById(id: string) {
    const tx = await this.dataSource.getRepository(WagerTransaction).findOneBy({ id });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    return this.response(tx, false);
  }

  async getByExternal(providerId: string, externalTransactionId: string) {
    const tx = await this.dataSource.getRepository(WagerTransaction).findOneBy({ providerId, externalTransactionId });
    if (!tx) throw new NotFoundException('Transação não encontrada');
    return this.response(tx, false);
  }

  private response(tx: WagerTransaction, replay: boolean, balance?: string) {
    return {
      transactionId: tx.id, status: tx.status, failureCode: tx.failureCode ?? null,
      balance: balance || tx.responseBalance ? { amount: balance ?? tx.responseBalance, currency: tx.currency } : null,
      idempotentReplay: replay,
    };
  }

  private async enqueue(manager: any, tx: WagerTransaction, eventType: string, balance: string, extra: Record<string, unknown> = {}) {
    const payload = {
      eventId: randomUUID(), eventType, version: 1, aggregateId: tx.walletId,
      correlationId: tx.id, occurredAt: new Date().toISOString(),
      data: { transactionId: tx.id, walletId: tx.walletId, providerId: tx.providerId,
        kind: tx.kind, status: tx.status, amount: { amount: tx.amount, currency: tx.currency },
        balance: { amount: balance, currency: tx.currency }, failureCode: tx.failureCode ?? null, ...extra },
    };
    await manager.getRepository(OutboxMessage).save(manager.getRepository(OutboxMessage).create({
      aggregateId: tx.walletId, eventType, payload,
    }));
  }
}
