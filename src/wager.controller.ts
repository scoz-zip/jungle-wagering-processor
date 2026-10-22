import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { WagerService } from './wager.service';

@Controller()
export class WagerController {
  constructor(private readonly wagers: WagerService) {}

  @Post('wagering/transactions')
  submit(@Body() body: any, @Headers('idempotency-key') key?: string) {
    return this.wagers.submit(body, key);
  }

  @Get('wagering/transactions/:transactionId')
  getById(@Param('transactionId') id: string) {
    return this.wagers.getById(id);
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  getByExternal(@Param('providerId') providerId: string, @Param('externalTransactionId') externalId: string) {
    return this.wagers.getByExternal(providerId, externalId);
  }
}
