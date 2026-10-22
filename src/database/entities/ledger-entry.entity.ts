import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('wallet_ledger')
@Index('uq_ledger_transaction_wallet', ['transactionId', 'walletId'], { unique: true })
@Check('chk_ledger_nonnegative_after', '"balance_after" >= 0')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @Column({ type: 'varchar', length: 10 })
  direction!: 'DEBIT' | 'CREDIT';

  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount!: string;

  @Column({ name: 'balance_before', type: 'numeric', precision: 20, scale: 2 })
  balanceBefore!: string;

  @Column({ name: 'balance_after', type: 'numeric', precision: 20, scale: 2 })
  balanceAfter!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
