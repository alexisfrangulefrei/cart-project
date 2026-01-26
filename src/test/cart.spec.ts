import { describe, it, expect } from 'vitest';
import { Cart } from '../class/cart';

describe('Cart', () => {
    // Ensures constructor yields an empty cart matching the spec.
    it('initially empty', () => {
        const cart = new Cart();

        const total = cart.getTotalAmount();
        const refs = cart.getReferences();

        expect(total).toBe(0);
        expect(refs).toEqual([]);
        expect(() => cart.getUnitPrices('A')).toThrowError(/Reference not found/i);
        expect(() => cart.getQuantity('A')).toThrowError(/Reference not found/i);
        expect(() => cart.getAmount('A', 10)).toThrowError(/Reference not found/i);
    });

describe('add', () => {
    // Adding a brand-new reference/price pair populates structures.
    it('adds a new reference/price bucket', () => {
        const cart = new Cart();

        cart.add('A', 10, 2);

        expect(cart.getReferences()).toEqual(['A']);
        expect(cart.getUnitPrices('A')).toEqual([10]);
        expect(cart.getQuantity('A')).toBe(2);
        expect(cart.getQuantity('A', 10)).toBe(2);
        expect(cart.getAmount('A', 10)).toBe(20);
        expect(cart.getTotalAmount()).toBe(20);
    });

    // DRY rule: duplicate tuples should merge quantities.
    it('accumulates quantity on same reference/price (no duplicate pair)', () => {
        const cart = new Cart();
        cart.add('A', 10, 2);
        cart.add('A', 10, 3);

        expect(cart.getUnitPrices('A')).toEqual([10]);
        expect(cart.getQuantity('A', 10)).toBe(5);
        expect(cart.getTotalAmount()).toBe(50);
    });

    // Multiple prices per reference remain sorted to simplify accessors.
    it('supports multiple prices for the same reference and sorts unit prices ascending', () => {
        const cart = new Cart();

        cart.add('A', 12, 1);
        cart.add('A', 10, 2);

        expect(cart.getUnitPrices('A')).toEqual([10, 12]);
        expect(cart.getQuantity('A')).toBe(3);
        expect(cart.getAmount('A', 12)).toBe(12);
        expect(cart.getTotalAmount()).toBe(32);
    });

    // Input references are trimmed to avoid accidental duplicates.
    it('normalizes (trims) reference keys', () => {
        const cart = new Cart();

        cart.add('  A  ', 10, 1);

        expect(cart.getReferences()).toEqual(['A']);
        expect(cart.getQuantity('A')).toBe(1);
    });

    // References accessor must return alphabetical order.
    it('sorts references alphabetically', () => {
        const cart = new Cart();

        cart.add('B', 5, 1);
        cart.add('A', 5, 1);

        expect(cart.getReferences()).toEqual(['A', 'B']);
    });

    // Validation: empty references are rejected.
    it('throws on invalid reference', () => {
        const cart = new Cart();

        expect(() => cart.add('', 10, 1)).toThrowError(/Reference must be a non-empty string/i);
        expect(() => cart.add('   ', 10, 1)).toThrowError(/Reference must be a non-empty string/i);
    });

    // Validation: prices must be positive numbers.
    it('throws on invalid price', () => {
        const cart = new Cart();

        expect(() => cart.add('A', 0, 1)).toThrowError(/Price must be a positive number/i);
        expect(() => cart.add('A', -1, 1)).toThrowError(/Price must be a positive number/i);
        expect(() => cart.add('A', Number.NaN, 1)).toThrowError(/Price must be a positive number/i);
    });

    // Validation: quantities must be positive integers.
    it('throws on invalid quantity', () => {
        const cart = new Cart();

        expect(() => cart.add('A', 10, 0)).toThrowError(/Quantity must be a positive integer/i);
        expect(() => cart.add('A', 10, -2)).toThrowError(/Quantity must be a positive integer/i);
        expect(() => cart.add('A', 10, 1.5)).toThrowError(/Quantity must be a positive integer/i);
    });
  });

describe('remove', () => {
    // Removing simple quantities keeps bucket totals consistent.
    it('removes from a single price bucket', () => {
        const cart = new Cart();

        cart.add('A', 10, 5);
        cart.remove('A', 2);

        expect(cart.getQuantity('A', 10)).toBe(3);
        expect(cart.getTotalAmount()).toBe(30);
    });

    // Business rule: drain most expensive items before cheaper ones.
    it('removes starting from the most expensive price first', () => {
        const cart = new Cart();

        cart.add('A', 10, 2);
        cart.add('A', 12, 3);
        cart.remove('A', 4);

        expect(cart.getUnitPrices('A')).toEqual([10]);
        expect(cart.getQuantity('A', 10)).toBe(1);
        expect(cart.getTotalAmount()).toBe(10);
        expect(() => cart.getQuantity('A', 12)).toThrowError(/Price not found/i);
    });

    // Ensure partial removal from a bucket preserves the remainder.
    it('partially consumes the most expensive bucket without deleting it', () => {
        const cart = new Cart();
        cart.add('A', 10, 5);
        cart.add('A', 12, 5);

        cart.remove('A', 3);

        expect(cart.getQuantity('A', 12)).toBe(2);
        expect(cart.getQuantity('A', 10)).toBe(5);
        expect(cart.getTotalAmount()).toBe(12 * 2 + 10 * 5);
    });

    // Empty references should disappear completely.
    it('deletes the reference when last item removed', () => {
        const cart = new Cart();

        cart.add('A', 10, 2);
        cart.remove('A', 2);

        expect(cart.getReferences()).toEqual([]);
        expect(() => cart.getQuantity('A')).toThrowError(/Reference not found/i);
    });

    // Removing a non-existent reference is an error.
    it('throws when reference is not present', () => {
        const cart = new Cart();

        expect(() => cart.remove('A', 1)).toThrowError(/Reference not found/i);
    });

    // Removal still enforces positive integer quantities.
    it('throws when quantity is invalid', () => {
        const cart = new Cart();

        cart.add('A', 10, 1);

        expect(() => cart.remove('A', 0)).toThrowError(/Quantity must be a positive integer/i);
        expect(() => cart.remove('A', -1)).toThrowError(/Quantity must be a positive integer/i);
        expect(() => cart.remove('A', 1.2)).toThrowError(/Quantity must be a positive integer/i);
    });

    // Guard against removing more than exists across buckets.
    it('throws when removing more than total quantity (across all prices)', () => {
        const cart = new Cart();

        cart.add('A', 10, 2);
        cart.add('A', 12, 1);

        expect(() => cart.remove('A', 4)).toThrowError(/Insufficient quantity/i);
    });
  });

describe('accessors / errors', () => {
    // Price-filtered quantities require the price to exist.
    it('getQuantity(reference, price) throws when price not found', () => {
        const cart = new Cart();

        cart.add('A', 10, 1);

        expect(() => cart.getQuantity('A', 999)).toThrowError(/Price not found/i);
    });

    // Amount accessor still validates price inputs before lookup.
    it('getAmount(reference, price) throws when price is invalid', () => {
        const cart = new Cart();

        cart.add('A', 10, 1);

        expect(() => cart.getAmount('A', 0)).toThrowError(/Price must be a positive number/i);
        expect(() => cart.getAmount('A', -5)).toThrowError(/Price must be a positive number/i);
        expect(() => cart.getAmount('A', Number.NaN)).toThrowError(/Price must be a positive number/i);
    });
  });

describe('promotions', () => {
    // Activation attempts for unknown codes must return false.
    it('returns false when activating a non-registered code', () => {
        const cart = new Cart();

        const activated = cart.activatePromotion('PROMO10');

        expect(activated).toBe(false);
    });

    // Registering a code for a reference outside the cart should allow activation later.
    it('registers a promotion for a reference not yet in the cart', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO10', 'A', 10);

        const activated = cart.activatePromotion('PROMO10');

        expect(activated).toBe(true);
    });

    // Once activated, the promotion must discount totals for its reference.
    it('applies promotion to totals after activation', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO10', 'A', 10);
        cart.add('A', 50, 2);

        expect(cart.activatePromotion('PROMO10')).toBe(true);

        expect(cart.getTotalAmount()).toBe(90);
        expect(cart.getAmount('A', 50)).toBe(90);
    });

    // Promotions for distinct references should stack independently.
    it('supports multiple active codes for different references', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO10', 'A', 10);
        cart.registerPromotion('PROMO20', 'B', 20);
        cart.add('A', 50, 2);
        cart.add('B', 100, 1);

        expect(cart.activatePromotion('PROMO10')).toBe(true);
        expect(cart.activatePromotion('PROMO20')).toBe(true);

        expect(cart.getTotalAmount()).toBe(90 + 80);
        expect(cart.getAmount('A', 50)).toBe(90);
        expect(cart.getAmount('B', 100)).toBe(80);
    });

    // Second activation for the same reference must fail (non-cumulable rule).
    it('rejects activation of another code targeting the same reference', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO10', 'A', 10);
        cart.registerPromotion('PROMO15', 'A', 15);
        cart.add('A', 50, 2);

        expect(cart.activatePromotion('PROMO10')).toBe(true);
        expect(cart.activatePromotion('PROMO15')).toBe(false);
        expect(cart.getAmount('A', 50)).toBe(90);
    });

    // Min price ensures only eligible unit prices get discounted.
    it('applies discount only when unit price meets minimum', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO20', 'A', 20, 40);
        cart.add('A', 30, 1);
        cart.add('A', 50, 1);

        expect(cart.activatePromotion('PROMO20')).toBe(true);
        expect(cart.getAmount('A', 30)).toBe(30);
        expect(cart.getAmount('A', 50)).toBe(40);
    });

    // Registering with a minimum price still disallows activation if reference missing.
    it('supports registering promotion with minimum price when reference absent', () => {
        const cart = new Cart();

        cart.registerPromotion('PROMO15', 'B', 15, 60);
        cart.add('B', 80, 1);

        expect(cart.activatePromotion('PROMO15')).toBe(true);
        expect(cart.getAmount('B', 80)).toBe(68);
    });
});
});
