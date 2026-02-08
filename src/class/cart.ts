type PriceBucket = Map<number, number>;

type PercentPromotion = {
	type: 'percent';
	reference: string;
	percent: number;
	minPrice?: number;
	activated: boolean;
};

type BuyNGetOnePromotion = {
	type: 'buyNGetOne';
	reference: string;
	threshold: number;
	activated: boolean;
};

type PromotionRule = PercentPromotion | BuyNGetOnePromotion;

export class Cart {
	private readonly items: Map<string, PriceBucket> = new Map();
	private readonly promotions: Map<string, PromotionRule> = new Map();

	// Adds quantity to a reference/price pair while preventing duplicate tuples.
	public add(reference: string, price: number, quantity: number): void {
		this.assertPrice(price);
		this.assertQuantity(quantity);
		const { bucket } = this.getOrCreateBucket(reference);

		const existingQuantity = bucket.get(price) ?? 0;
		bucket.set(price, existingQuantity + quantity);
	}

	// Removes quantity starting from the costliest units, as required.
	public remove(reference: string, quantity: number): void {
		const { refKey, bucket } = this.getExistingBucket(reference);
		this.assertQuantity(quantity);

		const totalQuantity = this.sumQuantities(bucket);
		if (quantity > totalQuantity) {
			throw new Error('Insufficient quantity to remove');
		}

		const pricesDesc = this.sortPrices(bucket, 'desc');

		let remaining = quantity;
		for (const price of pricesDesc) {
			if (remaining === 0) {
				break;
			}

			const available = bucket.get(price);
			if (available === undefined) {
				continue;
			}

			// Remove units starting from highest priced entries.
			if (available <= remaining) {
				remaining -= available;
				bucket.delete(price);
			} else {
				bucket.set(price, available - remaining);
				remaining = 0;
			}
		}

		if (bucket.size === 0) {
			this.items.delete(refKey);
		}
	}

	// Returns total monetary amount stored in the cart.
	public getTotalAmount(): number {
		let total = 0;
		for (const [reference, bucket] of this.items.entries()) {
			total += this.calculateBucketAmount(reference, bucket);
		}
		return total;
	}

	// Lists distinct references currently present.
	public getReferences(): string[] {
		return Array.from(this.items.keys()).sort();
	}

	// Enumerates unit prices available for the provided reference.
	public getUnitPrices(reference: string): number[] {
		const { bucket } = this.getExistingBucket(reference);
		return this.sortPrices(bucket, 'asc');
	}

	// Returns total quantity for a reference or for a specific price when provided.
	public getQuantity(reference: string, price?: number): number {
		const { bucket } = this.getExistingBucket(reference);

		if (price === undefined) {
			return this.sumQuantities(bucket);
		}

		return this.getQuantityForPrice(bucket, price);
	}

	// Returns amount for an existing reference/price tuple.
	public getAmount(reference: string, price: number): number {
		const { bucket } = this.getExistingBucket(reference);
		const quantity = this.getQuantityForPrice(bucket, price);
		const freebies = this.buildFreebieAllocation(reference, bucket);
		const freeUnits = freebies.get(price) ?? 0;
		const payable = Math.max(0, quantity - freeUnits);
		return this.getDiscountedPrice(reference, price) * payable;
	}

	// Registers a percent-based promotion for a reference absent from the cart.
	public registerPromotion(code: string, reference: string, percent: number, minPrice?: number): void {
		const promoCode = this.normalizePromotionCode(code);
		const refKey = this.normalizeReference(reference);
		this.assertPercent(percent);
		if (minPrice !== undefined) {
			this.assertPrice(minPrice);
		}
		if (this.items.has(refKey)) {
			throw new Error('Promotion reference must not be in cart');
		}
		if (this.promotions.has(promoCode)) {
			throw new Error('Promotion code already registered');
		}
		this.promotions.set(promoCode, {
			type: 'percent',
			reference: refKey,
			percent,
			minPrice,
			activated: false,
		});
	}

	// Registers a buy-N-get-one promotion for a reference absent from the cart.
	public registerBuyNGetOnePromotion(code: string, reference: string, threshold: number): void {
		const promoCode = this.normalizePromotionCode(code);
		const refKey = this.normalizeReference(reference);
		this.assertThreshold(threshold);
		if (this.items.has(refKey)) {
			throw new Error('Promotion reference must not be in cart');
		}
		if (this.promotions.has(promoCode)) {
			throw new Error('Promotion code already registered');
		}
		this.promotions.set(promoCode, {
			type: 'buyNGetOne',
			reference: refKey,
			threshold,
			activated: false,
		});
	}

	// Activates a registered promotion code; returns false if unknown or if another code already discounts the same reference.
	public activatePromotion(code: string): boolean {
		const promoCode = this.normalizePromotionCode(code);
		const promotion = this.promotions.get(promoCode);
		if (!promotion) {
			return false;
		}
		if (promotion.activated) {
			return true;
		}
		if (this.hasActivePromotionForReference(promotion.reference, promoCode)) {
			return false;
		}
		promotion.activated = true;
		return true;
	}

	// Resolves an existing reference; throws if it is absent.
	private getExistingBucket(reference: string): { refKey: string; bucket: PriceBucket } {
		return this.resolveBucket(reference, false);
	}

	// Resolves a reference or creates a fresh bucket for writes.
	private getOrCreateBucket(reference: string): { refKey: string; bucket: PriceBucket } {
		return this.resolveBucket(reference, true);
	}

	// Centralized resolution to keep normalization and creation logic DRY.
	private resolveBucket(reference: string, createIfMissing: boolean): { refKey: string; bucket: PriceBucket } {
		const refKey = this.normalizeReference(reference);
		let bucket = this.items.get(refKey);
		if (!bucket) {
			if (!createIfMissing) {
				throw new Error('Reference not found in cart');
			}
			bucket = new Map<number, number>();
			this.items.set(refKey, bucket);
		}
		return { refKey, bucket };
	}

	// Fetches quantity for a (reference, price) and enforces price validity.
	private getQuantityForPrice(bucket: PriceBucket, price: number): number {
		this.assertPrice(price);
		const quantity = bucket.get(price);
		if (quantity === undefined) {
			throw new Error('Price not found for reference');
		}
		return quantity;
	}

	// Aggregates all stored quantities for the bucket.
	private sumQuantities(bucket: PriceBucket): number {
		let total = 0;
		for (const value of bucket.values()) {
			total += value;
		}
		return total;
	}

	// Sorts price keys to ensure deterministic order when iterating.
	private sortPrices(bucket: PriceBucket, direction: 'asc' | 'desc'): number[] {
		return Array.from(bucket.keys()).sort((a, b) => direction === 'asc' ? a - b : b - a);
	}

	// Computes total amount represented by a bucket, factoring promotions when needed.
	private calculateBucketAmount(reference: string, bucket: PriceBucket): number {
		const freebies = this.buildFreebieAllocation(reference, bucket);
		let total = 0;
		for (const [price, quantity] of bucket.entries()) {
			const freeUnits = freebies.get(price) ?? 0;
			const payable = Math.max(0, quantity - freeUnits);
			total += this.getDiscountedPrice(reference, price) * payable;
		}
		return total;
	}

	// Trims and validates references to avoid duplicate keys.
	private normalizeReference(reference: string): string {
		const value = reference.trim();
		if (!value) {
			throw new Error('Reference must be a non-empty string');
		}
		return value;
	}

	// Validates promotion codes to keep coupon registry consistent.
	private normalizePromotionCode(code: string): string {
		const value = code.trim();
		if (!value) {
			throw new Error('Promotion code must be a non-empty string');
		}
		return value;
	}

	// Guards that all quantities are positive integers.
	private assertQuantity(quantity: number): void {
		if (!Number.isInteger(quantity) || quantity <= 0) {
			throw new Error('Quantity must be a positive integer');
		}
	}

	// Guards that all prices are positive real numbers.
	private assertPrice(price: number): void {
		if (typeof price !== 'number' || Number.isNaN(price) || price <= 0) {
			throw new Error('Price must be a positive number');
		}
	}

	// Guards that promotion percentages are between 1 and 99 (inclusive).
	private assertPercent(percent: number): void {
		if (!Number.isInteger(percent) || percent <= 0 || percent >= 100) {
			throw new Error('Promotion percent must be an integer in (0, 100)');
		}
	}

	// Ensures buy-N-get-one thresholds are integers of at least 2 (buy 2 get 1).
	private assertThreshold(threshold: number): void {
		if (!Number.isInteger(threshold) || threshold < 2) {
			throw new Error('Promotion threshold must be an integer >= 2');
		}
	}

	// Applies an active promotion to the price when reference and min price conditions are met.
	private getDiscountedPrice(reference: string, price: number): number {
		const promotion = this.findApplicablePercentPromotion(reference, price);
		if (!promotion) {
			return price;
		}
		return price * (1 - promotion.percent / 100);
	}

	// Retrieves the first active percent-based promotion applicable to the reference/price pair.
	private findApplicablePercentPromotion(reference: string, price: number): PercentPromotion | undefined {
		for (const promotion of this.promotions.values()) {
			if (promotion.type !== 'percent') {
				continue;
			}
			if (promotion.reference !== reference) {
				continue;
			}
			if (!promotion.activated) {
				continue;
			}
			if (promotion.minPrice !== undefined && price < promotion.minPrice) {
				continue;
			}
			return promotion;
		}
		return undefined;
	}

	// Looks up an active buy-N-get-one promotion tied to the reference, if any.
	private findActiveBuyNPromotion(reference: string): BuyNGetOnePromotion | undefined {
		for (const promotion of this.promotions.values()) {
			if (promotion.type !== 'buyNGetOne') {
				continue;
			}
			if (!promotion.activated) {
				continue;
			}
			if (promotion.reference !== reference) {
				continue;
			}
			return promotion;
		}
		return undefined;
	}

	// Builds a per-price map describing how many units become free for the reference.
	private buildFreebieAllocation(reference: string, bucket: PriceBucket): Map<number, number> {
		const promotion = this.findActiveBuyNPromotion(reference);
		if (!promotion) {
			return new Map();
		}
		const block = promotion.threshold + 1;
		if (block <= 0) {
			return new Map();
		}
		const totalUnits = this.sumQuantities(bucket);
		let freebies = Math.floor(totalUnits / block);
		if (freebies <= 0) {
			return new Map();
		}
		const allocation = new Map<number, number>();
		for (const price of this.sortPrices(bucket, 'asc')) {
			if (freebies <= 0) {
				break;
			}
			const available = bucket.get(price) ?? 0;
			if (available <= 0) {
				continue;
			}
			const used = Math.min(available, freebies);
			allocation.set(price, used);
			freebies -= used;
		}
		return allocation;
	}

	// Checks whether another active promotion already targets the same reference.
	private hasActivePromotionForReference(reference: string, excludeCode?: string): boolean {
		for (const [code, promotion] of this.promotions.entries()) {
			if (excludeCode && code === excludeCode) {
				continue;
			}
			if (promotion.reference === reference && promotion.activated) {
				return true;
			}
		}
		return false;
	}
}
