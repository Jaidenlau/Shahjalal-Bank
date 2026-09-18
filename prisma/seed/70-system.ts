import type { PrismaClient } from "@prisma/client";
import { daysAgo, int, pick } from "./rng";

/**
 * Integration status panel and the notification centre.
 *
 * INTEGRATIONS ARE REPRESENTATIONAL. Nothing here connects to a real Core
 * Banking System and the screen says so. What it does show is the middleware
 * tier's inventory of connections and the API contract for each one, which is
 * the honest version of "here is where your CBS plugs in".
 *
 * The payment gateway is deliberately shown as pending configuration, because
 * that is exactly how it was answered in Annexure-B: needs customisation once
 * the bank selects its payment service provider.
 */

export async function seedSystem(
  db: PrismaClient,
  users: Record<string, { id: string; fullName: string }>,
) {
  const endpoints = [
    {
      code: "CBS", name: "Core Banking System", sequence: 1, status: "CONNECTED",
      direction: "BIDIRECTIONAL", protocol: "REST / HTTPS, mutual TLS",
      description:
        "Budget and cost centre validation, general ledger tagging on requisitions and work orders, and payment " +
        "instruction handoff for approved invoices.",
      latencyMs: 84,
      contract: [
        { method: "GET", path: "/cbs/v2/cost-centres/{code}", purpose: "Validate a cost centre and return its GL mapping" },
        { method: "GET", path: "/cbs/v2/budget/{fy}/{costCentre}/{gl}", purpose: "Retrieve allocated, committed and consumed balances" },
        { method: "POST", path: "/cbs/v2/gl-entries", purpose: "Post a payable entry on invoice approval" },
        { method: "POST", path: "/cbs/v2/payment-instructions", purpose: "Submit a payment instruction against an approved invoice" },
        { method: "GET", path: "/cbs/v2/payment-instructions/{ref}", purpose: "Poll settlement status" },
      ],
      note: "Integration is owned by the middleware tier. No other component holds a CBS credential.",
    },
    {
      code: "HRMS", name: "Human Resources Management System", sequence: 2, status: "CONNECTED",
      direction: "INBOUND", protocol: "REST / HTTPS",
      description:
        "Employee identity, designation, division and reporting hierarchy, so user provisioning reflects the bank's " +
        "actual org structure without a second manual register.",
      latencyMs: 142,
      contract: [
        { method: "GET", path: "/hrms/v1/employees", purpose: "Nightly roster synchronisation" },
        { method: "GET", path: "/hrms/v1/employees/{employeeId}", purpose: "Resolve a single employee record" },
        { method: "GET", path: "/hrms/v1/org-units", purpose: "Division and department hierarchy" },
        { method: "POST", path: "/hrms/v1/webhooks/leaver", purpose: "Receive leaver events for immediate access revocation" },
      ],
      note: "Leaver events revoke ERP access on receipt rather than at the next scheduled sync.",
    },
    {
      code: "DMS", name: "Document Management System", sequence: 3, status: "CONNECTED",
      direction: "BIDIRECTIONAL", protocol: "REST / HTTPS",
      description:
        "Centralised storage and retrieval for tender documents, contracts, delivery challans and compliance records " +
        "generated inside the ERP.",
      latencyMs: 196,
      contract: [
        { method: "POST", path: "/dms/v1/documents", purpose: "Archive a generated document with metadata" },
        { method: "GET", path: "/dms/v1/documents/{id}", purpose: "Retrieve an archived document" },
        { method: "GET", path: "/dms/v1/search", purpose: "Full-text and metadata search across the archive" },
      ],
      note: "",
    },
    {
      code: "EMAIL", name: "Email Gateway", sequence: 4, status: "CONNECTED",
      direction: "OUTBOUND", protocol: "SMTP over TLS",
      description:
        "Workflow notifications, approval alerts, tender publication notices to enlisted vendors, and escalation " +
        "reminders for approvals past their escalation window.",
      latencyMs: 61,
      contract: [
        { method: "SMTP", path: "smtp.sjiblbd.com:587", purpose: "Authenticated relay for system notifications" },
      ],
      note: "No email is sent from this demo build. Notifications are delivered to the in-app notification centre only.",
    },
    {
      code: "SMS", name: "SMS Gateway", sequence: 5, status: "CONNECTED",
      direction: "OUTBOUND", protocol: "REST / HTTPS",
      description: "One-time passcodes, approval alerts to mobile, and delivery confirmations to requisition initiators.",
      latencyMs: 118,
      contract: [
        { method: "POST", path: "/sms/v1/send", purpose: "Queue a transactional SMS" },
        { method: "GET", path: "/sms/v1/status/{messageId}", purpose: "Delivery receipt" },
      ],
      note: "No SMS is sent from this demo build.",
    },
    {
      code: "PAYMENT", name: "Payment Gateway", sequence: 6, status: "PENDING_CONFIGURATION",
      direction: "BIDIRECTIONAL", protocol: "To be determined by the selected provider",
      description:
        "Tender security money, bid and auction fee collection, vendor enlistment fees and canteen payment collection.",
      latencyMs: 0,
      contract: [],
      note:
        "Flagged in our proposal (Annexure-B, modules 3, 5, 6, 7, 18 and 24) as requiring customisation once the Bank " +
        "selects its payment service provider. The integration point is defined; the provider-specific adapter is built " +
        "during implementation.",
    },
    {
      code: "IAM", name: "Central Identity & Access Management", sequence: 7, status: "CONNECTED",
      direction: "BIDIRECTIONAL", protocol: "OAuth 2.0 / OpenID Connect, SAML 2.0",
      description:
        "Single sign-on, centralised password policy and session control, so the ERP does not hold a separate identity " +
        "silo alongside the bank's existing directory.",
      latencyMs: 73,
      contract: [
        { method: "GET", path: "/.well-known/openid-configuration", purpose: "Discovery" },
        { method: "POST", path: "/oauth2/token", purpose: "Authorisation code exchange" },
        { method: "GET", path: "/oauth2/userinfo", purpose: "Resolve claims for the authenticated principal" },
        { method: "POST", path: "/oauth2/revoke", purpose: "Session revocation on leaver or lockout" },
      ],
      note:
        "This demo runs local authentication so it is portable. In the production design, this connector replaces it " +
        "and the bank owns password policy centrally.",
    },
    {
      code: "BB_REPORTING", name: "Bangladesh Bank Regulatory Reporting", sequence: 8, status: "DEGRADED",
      direction: "OUTBOUND", protocol: "SFTP, scheduled batch",
      description: "Scheduled regulatory return submission and acknowledgement retrieval.",
      latencyMs: 0,
      contract: [
        { method: "SFTP", path: "/outbound/returns/", purpose: "Scheduled return file placement" },
        { method: "SFTP", path: "/inbound/ack/", purpose: "Acknowledgement collection" },
      ],
      note: "Shown degraded to demonstrate how the panel surfaces a connector that needs attention.",
    },
  ];

  for (const e of endpoints) {
    await db.integrationEndpoint.create({
      data: {
        code: e.code, name: e.name, description: e.description, status: e.status,
        direction: e.direction, protocol: e.protocol,
        lastSyncAt: e.status === "PENDING_CONFIGURATION" ? null
          : e.status === "DEGRADED" ? daysAgo(2)
          : new Date(Date.now() - int(2, 55) * 60_000),
        latencyMs: e.latencyMs,
        apiContract: JSON.stringify(e.contract),
        note: e.note,
        sequence: e.sequence,
      },
    });
  }

  // --- Notification centre -------------------------------------------------
  const notifications: Array<{ user: string; title: string; body: string; link?: string; age: number; read: boolean }> = [
    { user: "Farhana Akter", title: "Requisition awaiting your approval",
      body: "REQ/CSD/2026/0845 — Laptop replacement for branch operations staff, raised by Rezaul Karim, Gulshan Branch. Value ৳ 17,77,500.",
      link: "/requisitions/approvals", age: 2, read: false },
    { user: "Tanvir Ahmed", title: "Tender closed and ready for opening",
      body: "TND/SJIBL/2026/112 closed yesterday with 3 bids received. Technical envelopes are ready for opening by the Tender Opening Committee.",
      link: "/tenders", age: 1, read: false },
    { user: "Shahidul Islam", title: "Trade licence expiring",
      body: "Padma Enterprise — trade licence TRAD/DNCC/029934/2016 expires in 24 days. Renewal documentation has not been received.",
      link: "/vendors", age: 3, read: false },
    { user: "Nasrin Sultana", title: "Three-way match failed",
      body: "An invoice has failed the three-way match against its goods receipt note. Invoiced quantity exceeds the quantity received and accepted.",
      link: "/invoices", age: 4, read: false },
    { user: "Mizanur Rahman", title: "Preventive maintenance overdue",
      body: "Scheduled preventive maintenance items are past their due date across 2 sites. Review the schedule and reassign where needed.",
      link: "/building", age: 5, read: true },
    { user: "Shahidul Islam", title: "Contract expiring within 60 days",
      body: "Annual Maintenance Contract — Air Conditioning Units expires in 42 days. Renewal notice period has started.",
      link: "/contracts", age: 6, read: true },
    { user: "Rezaul Karim", title: "Requisition submitted",
      body: "REQ/CSD/2026/0845 has been submitted and is now with the Department Head for approval.",
      link: "/requisitions", age: 2, read: true },
    { user: "Mizanur Rahman", title: "Road tax expiring",
      body: "A pool vehicle tax token expires in 18 days. Arrange renewal through the Transport section.",
      link: "/transport", age: 7, read: true },
    { user: "Shahidul Islam", title: "Two tenders open for bidding",
      body: "TND/SJIBL/2026/110 and TND/SJIBL/2026/111 are published and accepting bids. Monitor bid counts before closing.",
      link: "/tenders", age: 4, read: true },
    { user: "Nasrin Sultana", title: "Invoices awaiting verification",
      body: "3 invoices are in Under Verification and have been open for more than 2 working days.",
      link: "/invoices", age: 3, read: true },
  ];

  for (const n of notifications) {
    const u = users[n.user];
    if (!u) continue;
    await db.notification.create({
      data: {
        userId: u.id, title: n.title, body: n.body, channel: "IN_APP",
        link: n.link ?? null, isRead: n.read,
        createdAt: daysAgo(n.age),
      },
    });
  }

  // --- A couple of saved reports, so the builder does not open empty ------
  const admin = users["Mizanur Rahman"]!;
  await db.savedReport.create({
    data: {
      name: "Requisitions by division, current financial year",
      entity: "requisition",
      columns: JSON.stringify(["requisitionNo", "title", "department", "branch", "status", "totalEstimatedValue", "createdAt"]),
      filters: JSON.stringify([{ field: "status", op: "in", value: ["APPROVED", "CLOSED"] }]),
      createdById: admin.id,
      createdAt: daysAgo(40),
    },
  });
  await db.savedReport.create({
    data: {
      name: "Vendor-wise work order history",
      entity: "purchaseOrder",
      columns: JSON.stringify(["poNo", "vendor", "totalAmount", "status", "issuedAt"]),
      filters: JSON.stringify([]),
      createdById: admin.id,
      createdAt: daysAgo(22),
    },
  });
}
