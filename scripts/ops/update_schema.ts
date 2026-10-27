import fs from "fs";

let content = fs.readFileSync("packages/db/src/schema.ts", "utf8");

const baUserTarget = `export const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});`.replace(/\r?\n/g, "\r\n");

const baUserReplacement = `export const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  stripeCustomerId: text("stripeCustomerId"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});`.replace(/\r?\n/g, "\r\n");

if (!content.includes(baUserTarget)) {
  throw new Error("baUserTarget not found");
}
content = content.replace(baUserTarget, baUserReplacement);

const verifTarget = `export const baVerification = pgTable("ba_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});`.replace(/\r?\n/g, "\r\n");

const additionalTables = `${verifTarget}

export const baSubscription = pgTable(
  "ba_subscription",
  {
    id: text("id").primaryKey(),
    plan: text("plan").notNull(),
    referenceId: text("referenceId").notNull(),
    stripeCustomerId: text("stripeCustomerId").notNull(),
    stripeSubscriptionId: text("stripeSubscriptionId").notNull().unique(),
    status: text("status").notNull(),
    periodStart: timestamp("periodStart"),
    periodEnd: timestamp("periodEnd"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false),
    seats: integer("seats"),
    trialStart: timestamp("trialStart"),
    trialEnd: timestamp("trialEnd"),
    createdAt: timestamp("createdAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
    updatedAt: timestamp("updatedAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
  },
  (table) => [
    index("ba_subscription_ref_idx").on(table.referenceId),
    index("ba_subscription_cust_idx").on(table.stripeCustomerId),
    index("ba_subscription_status_idx").on(table.status),
  ],
);

export const siteDonations = pgTable(
  "site_donations",
  {
    id: text("id").primaryKey(),
    userId: text("userId").references(() => baUser.id, { onDelete: "set null" }),
    donorName: text("donorName").notNull(),
    donorEmail: text("donorEmail"),
    amount: integer("amount").notNull(), // en centimes EUR
    currency: text("currency").notNull().default("eur"),
    message: text("message"),
    isAnonymous: boolean("isAnonymous").notNull().default(false),
    stripeCheckoutSessionId: text("stripeCheckoutSessionId").unique(),
    stripePaymentIntentId: text("stripePaymentIntentId").unique(),
    status: text("status").notNull().default("pending"),
    tier: text("tier"),
    createdAt: timestamp("createdAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
    updatedAt: timestamp("updatedAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
  },
  (table) => [
    index("site_donations_status_idx").on(table.status),
    index("site_donations_user_idx").on(table.userId),
  ],
);

export const siteAdSlots = pgTable(
  "site_ad_slots",
  {
    id: text("id").primaryKey(),
    slotKey: text("slotKey").notNull().unique(),
    name: text("name").notNull(),
    format: text("format").notNull(),
    adClient: text("adClient").notNull(),
    adSlot: text("adSlot").notNull(),
    active: boolean("active").notNull().default(true),
    exemptVip: boolean("exemptVip").notNull().default(true),
    createdAt: timestamp("createdAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
    updatedAt: timestamp("updatedAt").notNull().default(sql\`CURRENT_TIMESTAMP\`),
  },
);`.replace(/\r?\n/g, "\r\n");

if (!content.includes(verifTarget)) {
  throw new Error("verifTarget not found");
}
content = content.replace(verifTarget, additionalTables);

fs.writeFileSync("packages/db/src/schema.ts", content, "utf8");
console.log("schema.ts successfully updated!");
