import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initializeSchema } from "../src/db/schema";
import * as repo from "../src/db/repo";

describe("repo: catalog entries", () => {
  let db: Database;
  let seasonId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    initializeSchema(db);
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "S" });
    seasonId = s.id;
  });

  test("create catalog entry with all fields", () => {
    const entry = repo.createCatalogEntry(db, {
      crop: "Pepper", variety: "Corno di Toro Mix",
      vendor: "Renee's Garden", url: "https://example.com/pepper",
      sourceType: "seed", daysToMaturity: 80, startIndoorsWeeks: 8,
      minNightTemp: 50, spacingInches: 18, plantsPerSquare: 1,
      sun: "full_sun", growthHabit: "upright", gridSquares: 1,
      tags: "italian,roasting", notes: "Harvest when glossy",
    });
    expect(entry.id).toStartWith("catalog_");
    expect(entry.crop).toBe("Pepper");
    expect(entry.variety).toBe("Corno di Toro Mix");
    expect(entry.vendor).toBe("Renee's Garden");
    expect(entry.days_to_maturity).toBe(80);
    expect(entry.start_indoors_weeks).toBe(8);
    expect(entry.sun).toBe("full_sun");
    expect(entry.tags).toBe("italian,roasting");
  });

  test("create minimal catalog entry", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Basil", variety: "Genovese" });
    expect(entry.crop).toBe("Basil");
    expect(entry.vendor).toBeNull();
    expect(entry.days_to_maturity).toBeNull();
    expect(entry.plants_per_square).toBe(1);
    expect(entry.source_type).toBe("seed");
  });

  test("unique constraint on crop+variety", () => {
    repo.createCatalogEntry(db, { crop: "Tomato", variety: "Early Girl" });
    expect(() => repo.createCatalogEntry(db, { crop: "Tomato", variety: "Early Girl" })).toThrow();
  });

  test("find by crop and variety", () => {
    repo.createCatalogEntry(db, { crop: "Tomato", variety: "Early Girl" });
    const found = repo.findCatalogEntry(db, "Tomato", "Early Girl");
    expect(found).not.toBeNull();
    expect(found!.variety).toBe("Early Girl");
    expect(repo.findCatalogEntry(db, "Tomato", "Nonexistent")).toBeNull();
  });

  test("find entries by crop", () => {
    repo.createCatalogEntry(db, { crop: "Pepper", variety: "A" });
    repo.createCatalogEntry(db, { crop: "Pepper", variety: "B" });
    repo.createCatalogEntry(db, { crop: "Tomato", variety: "C" });
    const peppers = repo.findCatalogEntriesByCrop(db, "Pepper");
    expect(peppers).toHaveLength(2);
  });

  test("list with filters", () => {
    repo.createCatalogEntry(db, { crop: "Pepper", variety: "A", vendor: "Burpee", tags: "hot,red" });
    repo.createCatalogEntry(db, { crop: "Pepper", variety: "B", vendor: "Johnny's", tags: "mild" });
    repo.createCatalogEntry(db, { crop: "Tomato", variety: "C", vendor: "Burpee" });

    expect(repo.listCatalogEntries(db)).toHaveLength(3);
    expect(repo.listCatalogEntries(db, { crop: "Pepper" })).toHaveLength(2);
    expect(repo.listCatalogEntries(db, { vendor: "Burpee" })).toHaveLength(2);
    expect(repo.listCatalogEntries(db, { tag: "hot" })).toHaveLength(1);
  });

  test("update catalog entry", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Tomato", variety: "Early Girl" });
    const updated = repo.updateCatalogEntry(db, entry.id, { daysToMaturity: 52, vendor: "Local" });
    expect(updated!.days_to_maturity).toBe(52);
    expect(updated!.vendor).toBe("Local");
    expect(updated!.crop).toBe("Tomato"); // unchanged
  });

  test("update notes-append", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Tomato", variety: "X", notes: "First" });
    const updated = repo.updateCatalogEntry(db, entry.id, { notesAppend: "Second" });
    expect(updated!.notes).toContain("First");
    expect(updated!.notes).toContain("Second");
  });

  test("delete catalog entry", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Tomato", variety: "X" });
    repo.deleteCatalogEntry(db, entry.id);
    expect(repo.getCatalogEntry(db, entry.id)).toBeNull();
  });

  test("count plantings by catalog ID", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Tomato", variety: "X" });
    expect(repo.countPlantingsByCatalogId(db, entry.id)).toBe(0);
    repo.createPlanting(db, { seasonId, crop: "Tomato", variety: "X", catalogId: entry.id });
    expect(repo.countPlantingsByCatalogId(db, entry.id)).toBe(1);
  });

  test("planting links to catalog entry", () => {
    const entry = repo.createCatalogEntry(db, { crop: "Tomato", variety: "Early Girl" });
    const planting = repo.createPlanting(db, { seasonId, crop: "Tomato", variety: "Early Girl", catalogId: entry.id });
    expect(planting.catalog_id).toBe(entry.id);
    const fetched = repo.getPlanting(db, planting.id);
    expect(fetched!.catalog_id).toBe(entry.id);
  });
});

describe("repo: catalog reviews", () => {
  let db: Database;
  let seasonId: string;
  let catalogId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys=ON");
    initializeSchema(db);
    const g = repo.createGarden(db, "G");
    const s = repo.createSeason(db, { gardenId: g.id, year: 2026, name: "Spring 2026" });
    seasonId = s.id;
    const entry = repo.createCatalogEntry(db, { crop: "Pepper", variety: "Test" });
    catalogId = entry.id;
  });

  test("create review", () => {
    const review = repo.upsertCatalogReview(db, {
      catalogId, seasonId, rating: 4, yieldNotes: "20+ peppers",
      wouldGrowAgain: true, review: "Great producer",
    });
    expect(review.id).toStartWith("catrev_");
    expect(review.rating).toBe(4);
    expect(review.would_grow_again).toBe(1);
    expect(review.yield_notes).toBe("20+ peppers");
  });

  test("upsert updates existing review for same season", () => {
    repo.upsertCatalogReview(db, { catalogId, seasonId, rating: 3 });
    const updated = repo.upsertCatalogReview(db, { catalogId, seasonId, rating: 5, review: "Better than expected" });
    expect(updated.rating).toBe(5);
    expect(updated.review).toBe("Better than expected");
    // Should still be just one review
    const reviews = repo.listReviewsForCatalog(db, catalogId);
    expect(reviews).toHaveLength(1);
  });

  test("list reviews with season info", () => {
    repo.upsertCatalogReview(db, { catalogId, seasonId, rating: 4 });
    const reviews = repo.listReviewsForCatalog(db, catalogId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].year).toBe(2026);
    expect(reviews[0].season_name).toBe("Spring 2026");
  });

  test("count reviews for season", () => {
    expect(repo.countReviewsForSeason(db, seasonId)).toBe(0);
    repo.upsertCatalogReview(db, { catalogId, seasonId, rating: 4 });
    expect(repo.countReviewsForSeason(db, seasonId)).toBe(1);
  });

  test("cascade delete removes reviews", () => {
    repo.upsertCatalogReview(db, { catalogId, seasonId, rating: 4 });
    repo.deleteCatalogEntry(db, catalogId);
    expect(repo.listReviewsForCatalog(db, catalogId)).toHaveLength(0);
  });
});
