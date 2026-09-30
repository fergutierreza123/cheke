-- Adds a category to products, matching the approved design
-- (design/Inventory.html shows it above the product name on each card).
-- Not in CLAUDE.md's original core data model, but the "extend later" note
-- there covers exactly this.

alter table products
  add column category text;
