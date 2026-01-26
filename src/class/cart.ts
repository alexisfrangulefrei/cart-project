type PriceBucket = Map<number, number>;

export class Cart {
	private readonly items: Map<string, PriceBucket> = new Map();

	public add(reference: string, price: number, quantity: number): void {
		const refKey = this.normalizeReference(reference);
		this.assertPrice(price);
		this.assertQuantity(quantity);

		const bucket = this.items.get(refKey) ?? new Map<number, number>();
		const existingQuantity = bucket.get(price) ?? 0;
		bucket.set(price, existingQuantity + quantity);
		this.items.set(refKey, bucket);
	}

	public remove(reference: string, quantity: number): void {
		const { refKey, bucket } = this.requireBucket(reference);
		this.assertQuantity(quantity);

		const totalQuantity = Array.from(bucket.values()).reduce((sum, value) => sum + value, 0);
		if (quantity > totalQuantity) {
			throw new Error('Insufficient quantity to remove');
		}

		const pricesDesc = Array.from(bucket.keys()).sort((a, b) => b - a);

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

	public getTotalAmount(): number {
		let total = 0;
		for (const bucket of this.items.values()) {
			for (const [price, quantity] of bucket.entries()) {
				total += price * quantity;
			}
		}
		return total;
	}

	public getReferences(): string[] {
		return Array.from(this.items.keys()).sort();
	}

	public getUnitPrices(reference: string): number[] {
		const { bucket } = this.requireBucket(reference);
		return Array.from(bucket.keys()).sort((a, b) => a - b);
	}

	public getQuantity(reference: string, price?: number): number {
		const { bucket } = this.requireBucket(reference);

		if (price === undefined) {
			return Array.from(bucket.values()).reduce((sum, value) => sum + value, 0);
		}

		return this.getQuantityForPrice(bucket, price);
	}

	public getAmount(reference: string, price: number): number {
		const { bucket } = this.requireBucket(reference);
		const quantity = this.getQuantityForPrice(bucket, price);
		return price * quantity;
	}

	private requireBucket(reference: string): { refKey: string; bucket: PriceBucket } {
		const refKey = this.normalizeReference(reference);
		const bucket = this.items.get(refKey);
		if (!bucket) {
			throw new Error('Reference not found in cart');
		}
		return { refKey, bucket };
	}

	private getQuantityForPrice(bucket: PriceBucket, price: number): number {
		this.assertPrice(price);
		const quantity = bucket.get(price);
		if (quantity === undefined) {
			throw new Error('Price not found for reference');
		}
		return quantity;
	}

	private normalizeReference(reference: string): string {
		const value = reference.trim();
		if (!value) {
			throw new Error('Reference must be a non-empty string');
		}
		return value;
	}

	private assertQuantity(quantity: number): void {
		if (!Number.isInteger(quantity) || quantity <= 0) {
			throw new Error('Quantity must be a positive integer');
		}
	}

	private assertPrice(price: number): void {
		if (typeof price !== 'number' || Number.isNaN(price) || price <= 0) {
			throw new Error('Price must be a positive number');
		}
	}
}
