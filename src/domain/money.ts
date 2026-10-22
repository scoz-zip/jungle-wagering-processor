import Decimal from 'decimal.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

/**
 * Dinheiro usa Decimal internamente e string na API/banco.
 * Não converta amount para number: isso pode perder precisão.
 */
export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    if (!props || typeof props.amount !== 'string' || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(props.amount)) {
      throw new Error('INVALID_MONEY_AMOUNT');
    }
    if (!/^[A-Z]{3}$/.test(props.currency)) throw new Error('INVALID_CURRENCY');
    return new Money(new Decimal(props.amount).toDecimalPlaces(2), props.currency);
  }

  static zero(currency: string): Money {
    return Money.from({ amount: '0.00', currency });
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean { return this.value.isZero(); }
  isPositive(): boolean { return this.value.greaterThan(0); }
  isNegative(): boolean { return this.value.lessThan(0); }
  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lessThan(other.value);
  }
  equals(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.equals(other.value);
  }
  toJSON(): MoneyProps { return { amount: this.toString(), currency: this.currency }; }
  toString(): string { return this.value.toFixed(2); }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) throw new Error('CURRENCY_MISMATCH');
  }
}
