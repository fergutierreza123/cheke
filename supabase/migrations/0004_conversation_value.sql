-- Adds a manually-set deal value to conversations, matching the approved
-- Chekeo design (design/Main.html — `lead.value`, pipeline totals per
-- column). Real order totals (Phase 6 `orders` table) can supersede this
-- later; for now it's how a lead's value gets tracked in the kanban.

alter table conversations
  add column value_hnl numeric(12, 2);
