import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { OutboxMessage } from './database/entities/outbox-message.entity';

/**
 * Publisher simples executado sob demanda. Em produção, rodar como worker
 * separado e usar SKIP LOCKED + lease para coordenar vários publishers.
 * A publicação pode ocorrer mais de uma vez; consumidores devem deduplicar.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  async publishPending(limit = 25) {
    const client = new SQSClient({
      region: process.env.AWS_REGION ?? 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT ?? 'http://localhost:4566',
      credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test' },
    });
    const result: { published: number; errors: number } = { published: 0, errors: 0 };
    try {
      const source = (this as any).dataSource as DataSource;
      const rows = await source.getRepository(OutboxMessage).find({
        where: { publishedAt: null as any }, order: { createdAt: 'ASC' }, take: limit,
      });
      for (const row of rows) {
        try {
          await client.send(new SendMessageCommand({
            QueueUrl: process.env.SQS_QUEUE_URL,
            MessageBody: JSON.stringify(row.payload),
            MessageGroupId: row.aggregateId,
            MessageDeduplicationId: row.id,
          }));
          row.publishedAt = new Date();
          row.attempts += 1;
          await source.getRepository(OutboxMessage).save(row);
          result.published++;
        } catch (error) {
          row.attempts += 1;
          row.nextAttemptAt = new Date(Date.now() + Math.min(300000, 1000 * (2 ** Math.min(row.attempts, 8))));
          await source.getRepository(OutboxMessage).save(row);
          this.logger.error(JSON.stringify({ event: 'outbox_publish_failed', outboxId: row.id, attempts: row.attempts }));
          result.errors++;
        }
      }
    } finally { await client.destroy(); }
    return result;
  }
  constructor(private readonly dataSource: DataSource) {}
}
