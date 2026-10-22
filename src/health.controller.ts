import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SQSClient, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    const checks: Record<string, string> = {};
    try { await this.dataSource.query('SELECT 1'); checks.postgres = 'ok'; }
    catch { checks.postgres = 'error'; }
    try {
      const client = new SQSClient({
        region: process.env.AWS_REGION ?? 'us-east-1',
        endpoint: process.env.AWS_ENDPOINT ?? 'http://localhost:4566',
        credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test' },
      });
      await client.send(new GetQueueAttributesCommand({
        QueueUrl: process.env.SQS_QUEUE_URL ?? 'http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transactions.fifo',
        AttributeNames: ['ApproximateNumberOfMessages'],
      }));
      checks.sqs = 'ok';
      await client.destroy();
    } catch { checks.sqs = 'error'; }
    return { status: Object.values(checks).every(v => v === 'ok') ? 'ok' : 'degraded', checks };
  }
}
