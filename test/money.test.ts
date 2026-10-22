import { describe, expect, test } from 'bun:test';
import { Money } from '../src/domain/money';

describe('Money', () => {
  test('soma sem usar ponto flutuante', () => {
    const result = Money.from({ amount: '0.10', currency: 'BRL' })
      .add(Money.from({ amount: '0.20', currency: 'BRL' }));
    expect(result.toString()).toBe('0.30');
  });

  test('rejeita mais de duas casas decimais', () => {
    expect(() => Money.from({ amount: '10.001', currency: 'BRL' })).toThrow();
  });

  test('rejeita moeda diferente', () => {
    expect(() => Money.from({ amount: '1.00', currency: 'BRL' })
      .add(Money.from({ amount: '1.00', currency: 'USD' }))).toThrow('CURRENCY_MISMATCH');
  });
});
