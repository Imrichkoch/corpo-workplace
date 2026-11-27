import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  resource: text("resource").notNull(),
  date: text("date").notNull(),
  start: text("start").notNull(),
  end: text("end").notNull(),
  title: text("title").notNull(),
}, (table) => [index("booking_resource_date").on(table.resource, table.date)]);

export const visits = sqliteTable("visits", {
  id: text("id").primaryKey(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  company: text("company").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  office: text("office").notNull(),
  status: text("status").notNull().default("expected"),
}, (table) => [index("visit_owner").on(table.owner)]);
