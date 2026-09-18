import { requireUser, assertCan } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDateTime, relativeDays } from "@/lib/date";
import {
  Card, CardHeader, PageHeader, Pill, Icon, Note, Stat, Table, Th, Td, Tr,
} from "@/components/ui";

export const dynamic = "force-dynamic";

interface Endpoint { method: string; path: string; purpose: string }

/**
 * Integration status.
 *
 * REPRESENTATIONAL, and the screen says so at the top. Nothing here reaches a
 * real Core Banking System — faking live CBS data would be the single most
 * damaging thing this demo could do, because the bank's IT division would find
 * out. What it does show is the middleware tier's inventory of connections and
 * the API contract for each, which is the honest version of "here is where your
 * CBS plugs in".
 */
export default async function IntegrationsPage() {
  const user = await requireUser();
  assertCan(user, "INTEGRATION", "VIEW");

  const endpoints = await prisma.integrationEndpoint.findMany({ orderBy: { sequence: "asc" } });

  const connected = endpoints.filter(e => e.status === "CONNECTED").length;
  const degraded = endpoints.filter(e => e.status === "DEGRADED").length;
  const pending = endpoints.filter(e => e.status === "PENDING_CONFIGURATION").length;

  return (
    <>
      <PageHeader
        eyebrow="Middleware and Integration Tier"
        title="Integrations"
        subtitle="One layer owns every connection to a system outside this one. Nothing in the core application holds a credential for the Core Banking System or any other external service."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Connectors" value={endpoints.length} />
        <Stat label="Connected" value={connected} tone="success" />
        <Stat label="Degraded" value={degraded} tone={degraded ? "warn" : "neutral"} />
        <Stat label="Pending configuration" value={pending} tone="neutral"
          sub={pending ? "Awaiting the Bank's decision" : "None"} />
      </div>

      <div className="mb-5">
        <Note tone="warn" title="What this screen is, and what it is not">
          This build runs on a single machine with no network access, so no connector here is
          live. The panel shows the integration inventory, the direction and protocol of each
          connection, and the API contract that would be implemented. It does not show data
          retrieved from the Bank&apos;s systems, and no screen in this build does.
        </Note>
      </div>

      <div className="space-y-4">
        {endpoints.map(e => {
          let contract: Endpoint[] = [];
          try { contract = JSON.parse(e.apiContract); } catch { contract = []; }
          return (
            <Card key={e.id} pad={false} className={
              e.status === "PENDING_CONFIGURATION" ? "border-ink-300"
              : e.status === "DEGRADED" ? "border-warn-500/40" : ""
            }>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      e.status === "CONNECTED" ? "bg-brand-500"
                      : e.status === "DEGRADED" ? "bg-warn-500" : "bg-ink-300"
                    }`} />
                    {e.name}
                    <span className="font-mono text-[11.5px] font-normal text-ink-400">{e.code}</span>
                  </span>
                }
                subtitle={e.description}
                action={<Pill status={e.status} />}
              />

              <dl className="grid gap-x-8 gap-y-2 border-b border-ink-100 px-5 py-3 sm:grid-cols-4">
                {[
                  ["Direction", e.direction.replace(/_/g, " ").toLowerCase()],
                  ["Protocol", e.protocol],
                  ["Last synchronised", e.lastSyncAt ? formatDateTime(e.lastSyncAt) : "Never"],
                  ["Round trip", e.latencyMs ? `${e.latencyMs} ms` : "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <dt className="text-[11px] uppercase tracking-[0.05em] text-ink-500">{l}</dt>
                    <dd className="text-[12.5px] font-medium capitalize text-ink-800">{v}</dd>
                  </div>
                ))}
              </dl>

              {contract.length > 0 ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-2.5 text-[12.5px] font-semibold text-ink-700 hover:bg-ink-50">
                    <Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    API contract — {contract.length} endpoint{contract.length === 1 ? "" : "s"}
                  </summary>
                  <Table className="border-t border-ink-100">
                    <thead>
                      <tr><Th width="90px">Method</Th><Th>Path</Th><Th>Purpose</Th></tr>
                    </thead>
                    <tbody>
                      {contract.map(c => (
                        <Tr key={c.path + c.method}>
                          <Td>
                            <span className="rounded-[3px] bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-700">
                              {c.method}
                            </span>
                          </Td>
                          <Td mono className="text-ink-800">{c.path}</Td>
                          <Td className="text-ink-600">{c.purpose}</Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </details>
              ) : null}

              {e.note ? (
                <div className={`border-t px-5 py-2.5 text-[12.5px] leading-relaxed ${
                  e.status === "PENDING_CONFIGURATION"
                    ? "border-ink-200 bg-ink-50 text-ink-600"
                    : "border-ink-100 text-ink-600"
                }`}>
                  {e.note}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-5">
        <Note tone="info" title="Why integration sits in its own tier">
          Every outbound and inbound connection is owned by the middleware layer, so when the Bank
          upgrades a CBS API version, one layer changes and core business logic is untouched. It
          also means every integration point is documented, monitored and secured in one place
          rather than scattered through the application as point-to-point connections.
        </Note>
      </div>
    </>
  );
}
