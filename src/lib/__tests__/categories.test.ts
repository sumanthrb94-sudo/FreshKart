import { describe, it, expect, beforeEach } from "vitest";
import { MockDataSource } from "../api/mock";
import { store } from "../api/mock-store";

describe("Category Management", () => {
  let api: MockDataSource;

  beforeEach(() => {
    store.reset();
    api = new MockDataSource();
  });

  it("lists initial default categories", async () => {
    const categories = await api.listCategories();
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories.some((c) => c.id === "vegetables")).toBe(true);
    expect(categories.some((c) => c.id === "leafy-greens")).toBe(true);
  });

  it("creates a new category and assigns existing products to it", async () => {
    const products = await api.listProducts();
    const productToAssign = products[0];
    expect(productToAssign).toBeDefined();

    const newCat = await api.createCategory({
      name: "Exotic Fruits",
      productIds: [productToAssign.id],
    });

    expect(newCat.name).toBe("Exotic Fruits");
    expect(newCat.id).toBe("exotic-fruits");

    const categories = await api.listCategories();
    expect(categories.some((c) => c.id === "exotic-fruits")).toBe(true);

    const updatedProduct = await api.getProduct(productToAssign.id);
    expect(updatedProduct?.category).toBe("exotic-fruits");
  });

  it("deletes a category and reassigns its products to a fallback category", async () => {
    const products = await api.listProducts();
    const p1 = products[0];

    const cat = await api.createCategory({
      name: "Temporary Category",
      productIds: [p1.id],
    });

    let assigned = await api.getProduct(p1.id);
    expect(assigned?.category).toBe(cat.id);

    await api.deleteCategory(cat.id, "vegetables");

    const categories = await api.listCategories();
    expect(categories.some((c) => c.id === cat.id)).toBe(false);

    assigned = await api.getProduct(p1.id);
    expect(assigned?.category).toBe("vegetables");
  });

  it("rejects creating category with empty name", async () => {
    await expect(api.createCategory({ name: "   " })).rejects.toThrow("Category name is required.");
  });
});
