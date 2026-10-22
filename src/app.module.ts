import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './database/entities/wallet.entity';
import { WagerTransaction } from './database/entities/wager-transaction.entity';
import { LedgerEntry } from './database/entities/ledger-entry.entity';
import { OutboxMessage } from './database/entities/outbox-message.entity';
import { WalletController } from './wallet.controller';
import { WagerController } from './wager.controller';
import { HealthController } from './health.controller';
import { WagerService } from './wager.service';
import { WalletService } from './wallet.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'jungle',
      password: process.env.DB_PASSWORD ?? 'jungle_dev_password',
      database: process.env.DB_NAME ?? 'jungle_wagering',
      entities: [Wallet, WagerTransaction, LedgerEntry, OutboxMessage],
      synchronize: true,
      retryAttempts: 10,
      retryDelay: 2000,
    }),
    TypeOrmModule.forFeature([Wallet, WagerTransaction, LedgerEntry, OutboxMessage]),
  ],
  controllers: [WalletController, WagerController, HealthController],
  providers: [WagerService, WalletService, OutboxService],
})
export class AppModule {}
