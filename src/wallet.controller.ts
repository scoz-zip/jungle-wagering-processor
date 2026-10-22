import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Controller('wallets')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post()
  create(@Body() body: { playerId: string; initialBalance: { amount: string; currency: string } }) {
    return this.wallets.create(body.playerId, body.initialBalance);
  }

  @Get(':walletId/ledger')
  ledger(@Param('walletId', new ParseUUIDPipe()) walletId: string, @Query('limit') limit?: string) {
    return this.wallets.ledger(walletId, limit ? Number(limit) : 50);
  }

  @Post(':walletId/reconciliation')
  reconcile(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
    return this.wallets.reconcile(walletId);
  }

  @Get(':walletId')
  get(@Param('walletId', new ParseUUIDPipe()) walletId: string) {
    return this.wallets.get(walletId);
  }
}
