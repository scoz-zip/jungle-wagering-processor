import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Wallet } from './database/entities/wallet.entity';
import { WagerTransaction } from './database/entities/wager-transaction.entity';
import { LedgerEntry } from './database/entities/ledger-entry.entity';
import { Money } from './domain/money';
import { randomUUID } from 'crypto';

@Injectable()
export class WalletService {
  constructor(private readonly dataSource: DataSource) {}

  async create(playerId: string, initialBalance: { amount: string; currency: string }) {
    const money = Money.from(initialBalance);
    if (money.isNegative()) throw new BadRequestException('Saldo inicial não pode ser negativo');
    try {
      return await this.dataSource.transaction(async manager => {
        const walletRepo = manager.getRepository(Wallet);
        const wallet = walletRepo.create({
          playerId, currency: money.currency, balance: money.toString(), version: 1,
        });
        await walletRepo.save(wallet);
        if (money.isPositive()) {
          const opening = manager.getRepository(WagerTransaction).create({
            providerId: 'internal', externalTransactionId: `opening:${wallet.id}`,
            idempotencyKey: `opening:${wallet.id}`, payloadHash: '0'.repeat(64),
            walletId: wallet.id, playerId, roundId: 'opening', gameId: 'internal',
            kind: 'OPENING', amount: money.toString(), currency: money.currency,
            status: 'PROCESSED', responseBalance: money.toString(), processedAt: new Date(),
          });
          await manager.getRepository(WagerTransaction).save(opening);
          await manager.getRepository(LedgerEntry).save(manager.getRepository(LedgerEntry).create({
            walletId: wallet.id, transactionId: opening.id, direction: 'CREDIT',
            amount: money.toString(), balanceBefore: '0.00', balanceAfter: money.toString(),
          }));
        }
        return { id: wallet.id, playerId, balance: money.toJSON(), version: wallet.version };
      });
    } catch (error: any) {
      if (error?.code === '23505') throw new ConflictException('Já existe uma wallet para playerId e currency');
      throw error;
    }
  }

  async get(walletId: string) {
    const wallet = await this.dataSource.getRepository(Wallet).findOneBy({ id: walletId });
    if (!wallet) throw new NotFoundException('Wallet não encontrada');
    return {
      id: wallet.id, playerId: wallet.playerId,
      balance: { amount: wallet.balance, currency: wallet.currency },
      version: wallet.version, createdAt: wallet.createdAt, updatedAt: wallet.updatedAt,
    };
  }

  async ledger(walletId: string, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit deve estar entre 1 e 100');
    const wallet = await this.dataSource.getRepository(Wallet).findOneBy({ id: walletId });
    if (!wallet) throw new NotFoundException('Wallet não encontrada');
    const entries = await this.dataSource.getRepository(LedgerEntry).find({
      where: { walletId }, order: { createdAt: 'DESC', id: 'DESC' }, take: limit,
    });
    return { walletId, entries };
  }

  async reconcile(walletId: string) {
    return this.dataSource.transaction(async manager => {
      const wallet = await manager.getRepository(Wallet).findOneBy({ id: walletId });
      if (!wallet) throw new NotFoundException('Wallet não encontrada');
      const rows = await manager.getRepository(LedgerEntry).find({ where: { walletId } });
      let calculated = Money.zero(wallet.currency);
      for (const row of rows) {
        const amount = Money.from({ amount: row.amount, currency: wallet.currency });
        calculated = row.direction === 'CREDIT' ? calculated.add(amount) : calculated.subtract(amount);
      }
      const stored = Money.from({ amount: wallet.balance, currency: wallet.currency });
      const difference = stored.subtract(calculated);
      return {
        walletId,
        storedBalance: stored.toJSON(),
        calculatedBalance: calculated.toJSON(),
        difference: difference.toJSON(),
        consistent: difference.isZero(),
        checkedEntries: rows.length,
      };
    });
  }
}
