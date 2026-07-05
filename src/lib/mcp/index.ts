import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPurchaseOrders from "./tools/list-purchase-orders";
import listInvoices from "./tools/list-invoices";
import listPayments from "./tools/list-payments";
import getSupplierProfile from "./tools/get-supplier-profile";

// The OAuth issuer MUST be the direct Supabase host, built from the project
// ref (Vite inlines this literal at build time, so it stays import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "emboss-supplier-portal",
  title: "Emboss Supplier Portal",
  version: "0.1.0",
  instructions:
    "Tools for the Emboss Marketing supplier portal. Use these to look up the signed-in supplier's purchase orders, invoices, payments, and account profile. All data is scoped to the authenticated supplier.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPurchaseOrders, listInvoices, listPayments, getSupplierProfile],
});
