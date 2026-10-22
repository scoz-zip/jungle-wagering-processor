import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('wager_transactions')
@Index('uq_wager_idempotency_key', ['idempotencyKey'], { unique: true })
@Index('uq_provider_external_id', ['providerId', 'externalTransactionId'], { unique: true })
export class WagerTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_id' })
  providerId!: string;

  @Column({ name: 'external_transaction_id' })
  externalTransactionId!: string;

  @Column({ name: 'idempotency_key' })
  idempotencyKey!: string;

  @Column({ name: 'payload_hash', type: 'char', length: 64 })
  payloadHash!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId!: string;

  @Column({ name: 'round_id' })
  roundId!: string;

  @Column({ name: 'game_id' })
  gameId!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status!: string;

  @Column({ name: 'reference_external_transaction_id', nullable: true })
  referenceExternalTransactionId?: string;

  @Column({ name: 'reference_transaction_id', type: 'uuid', nullable: true })
  referenceTransactionId?: string;

  @Column({ name: 'failure_code', nullable: true })
  failureCode?: string;

  @Column({ name: 'response_balance', type: 'numeric', precision: 20, scale: 2, nullable: true })
  responseBalance?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;
}
