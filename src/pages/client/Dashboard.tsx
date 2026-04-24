import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { CalendarClock, Package, Signal, Wifi } from "lucide-react";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function ClientDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [simView, setSimView] = useState<"cards" | "list">("cards");
  const [simSearch, setSimSearch] = useState("");
  const [simNetworkFilter, setSimNetworkFilter] = useState<string>("all");
  const [simStatusFilter, setSimStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!user) return;
    
    async function loadData() {
      try {
        setLoading(true);
        const simsRes = await api<{ sims: any[] }>("/api/client/sims");
        setSims(simsRes.sims);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [user]);

  if (loading) return <div>Loading...</div>;

  const simsWithActiveBundles = sims.filter((s: any) => s?.activeBundle);
  const activeSimsCount = sims.filter((s: any) => s?.status === "active").length;
  const totalRemainingMB = simsWithActiveBundles.reduce((sum: number, s: any) => sum + Number(s.activeBundle?.remainingAmountMB || 0), 0);
  const nextExpiryDate = simsWithActiveBundles.reduce<Date | null>((best: Date | null, s: any) => {
    const d = s?.activeBundle?.expiryDate ? new Date(s.activeBundle.expiryDate) : null;
    if (!d || Number.isNaN(d.getTime())) return best;
    if (!best) return d;
    return d.getTime() < best.getTime() ? d : best;
  }, null);
  const totalBalanceGB = totalRemainingMB / 1024;
  const showTotalBalance = totalRemainingMB > 0;

  const formatGB = (mb: number) => {
    const gb = mb / 1024;
    if (!Number.isFinite(gb)) return "-";
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    return `${Math.max(0, Math.round(mb))} MB`;
  };

  const networks = Array.from(
    new Set(
      sims
        .map((s: any) => String(s?.network || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const statuses = Array.from(
    new Set(
      sims
        .map((s: any) => String(s?.status || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredSims = sims.filter((s: any) => {
    const q = String(simSearch || "").trim().toLowerCase();
    const phone = String(s?.phoneNumber || "").toLowerCase();
    const iccid = String(s?.iccid || "").toLowerCase();
    const network = String(s?.network || "");
    const status = String(s?.status || "");
    const matchesSearch = !q || phone.includes(q) || iccid.includes(q);
    const matchesNetwork = simNetworkFilter === "all" || network === simNetworkFilter;
    const matchesStatus = simStatusFilter === "all" || status === simStatusFilter;
    return matchesSearch && matchesNetwork && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Live Data Bundle Status</h1>
        <p className="text-sm text-slate-500 mt-1">Here is the overview of your account.</p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-t-4 border-t-indigo-500">
          <div className="flex items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active SIMs</h3>
            <Wifi className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-black text-slate-900">{activeSimsCount}</div>
            <div className="text-xs text-slate-500 font-semibold">{sims.length} total</div>
          </div>
        </div>

        <div className="glass-card p-5 border-t-4 border-t-emerald-500">
          <div className="flex items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Balance</h3>
            <Signal className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-black text-slate-900">{showTotalBalance ? `${totalBalanceGB.toFixed(2)} GB` : "—"}</div>
            <div className="h-2 w-full rounded-full bg-slate-200/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.max(0, Math.min(100, showTotalBalance ? 100 : 0))}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Across active bundles</div>
          </div>
        </div>

        <div className="glass-card p-5 border-t-4 border-t-purple-500">
          <div className="flex items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Next Expiry</h3>
            <CalendarClock className="h-4 w-4 text-purple-600" />
          </div>
          <div className="space-y-2">
            <div className="text-3xl font-black text-slate-900">{nextExpiryDate ? format(nextExpiryDate, "MMM dd") : "—"}</div>
            <div className="text-xs text-slate-600 font-semibold">{nextExpiryDate ? format(nextExpiryDate, "yyyy-MM-dd") : "No active bundle"}</div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">My SIMs</h2>
          <p className="text-sm text-slate-500 mt-1">Data balance is updated by admin and shown per SIM.</p>
        </div>
        <div className="glass-card p-5">
          {sims.length === 0 ? (
            <div className="text-sm text-slate-600">No SIM cards found.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex flex-col gap-3 md:flex-row md:items-end">
                  <div className="grid gap-1.5">
                    <div className="text-xs font-bold text-slate-600">Search</div>
                    <Input
                      value={simSearch}
                      onChange={(e) => setSimSearch(e.target.value)}
                      placeholder="Phone number or ICCID..."
                      className="h-9 w-full md:w-[260px]"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <div className="text-xs font-bold text-slate-600">Network</div>
                    <Select value={simNetworkFilter} onValueChange={setSimNetworkFilter}>
                      <SelectTrigger className="h-9 w-full md:w-[220px]">
                        <SelectValue placeholder="All networks" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {networks.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <div className="text-xs font-bold text-slate-600">Status</div>
                    <Select value={simStatusFilter} onValueChange={setSimStatusFilter}>
                      <SelectTrigger className="h-9 w-full md:w-[200px]">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {statuses.map((st) => (
                          <SelectItem key={st} value={st}>
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={simView === "cards" ? "default" : "outline"}
                    className="h-9"
                    onClick={() => setSimView("cards")}
                  >
                    Card View
                  </Button>
                  <Button
                    type="button"
                    variant={simView === "list" ? "default" : "outline"}
                    className="h-9"
                    onClick={() => setSimView("list")}
                  >
                    List View
                  </Button>
                </div>
              </div>

              {filteredSims.length === 0 ? (
                <div className="text-sm text-slate-600">No SIM cards match your search / filters.</div>
              ) : simView === "list" ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone</TableHead>
                        <TableHead>Network</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Bundle</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Remaining</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredSims.map((s: any) => {
                        const totalMB = Number(s?.activeBundle?.totalAmountMB ?? 0);
                        const remainingMB = Number(s?.activeBundle?.remainingAmountMB ?? 0);
                        const expires = s?.activeBundle?.expiryDate ? new Date(s.activeBundle.expiryDate) : null;
                        const expiresText = expires && !Number.isNaN(expires.getTime()) ? format(expires, "yyyy-MM-dd") : "-";
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-semibold text-slate-800">{s.phoneNumber || "-"}</TableCell>
                            <TableCell className="text-xs text-slate-600">{s.network || "-"}</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                                }
                              >
                                {s.status || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-700">{s.activeBundle?.packageName || "No active bundle"}</TableCell>
                            <TableCell className="text-xs text-slate-600">{expiresText}</TableCell>
                            <TableCell className="text-xs text-slate-700">
                              {s.activeBundle ? formatGB(remainingMB) : "-"}
                              {s.activeBundle && totalMB ? ` / ${formatGB(totalMB)}` : ""}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-8 bg-indigo-600 hover:bg-indigo-700"
                                onClick={() => navigate("/client/orders")}
                              >
                                Order Data Bundle
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredSims.map((s: any) => {
                    const totalMB = Number(s?.activeBundle?.totalAmountMB ?? 0);
                    const remainingMB = Number(s?.activeBundle?.remainingAmountMB ?? 0);
                    const pct = totalMB > 0 ? Math.max(0, Math.min(100, (remainingMB / totalMB) * 100)) : 0;
                    const expires = s?.activeBundle?.expiryDate ? new Date(s.activeBundle.expiryDate) : null;
                    const expiresText = expires && !Number.isNaN(expires.getTime()) ? format(expires, "yyyy-MM-dd") : "-";

                    return (
                      <div key={s.id} className="rounded-xl border border-white/50 bg-white/50 p-4 flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-slate-900 truncate">{s.phoneNumber}</div>
                            <div className="text-xs text-slate-600 truncate">{s.network || "-"}</div>
                          </div>
                          <Badge
                            className={
                              s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                            }
                          >
                            {s.status}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-700 font-semibold min-w-0">
                              <Package className="h-3.5 w-3.5 text-indigo-600" />
                              <span className="truncate">{s.activeBundle?.packageName || "No active bundle"}</span>
                            </div>
                            <div className="text-slate-500 font-semibold">{expiresText}</div>
                          </div>

                          <div className="h-2 w-full rounded-full bg-slate-200/60 overflow-hidden">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-600 font-semibold">
                            <span>{s.activeBundle ? formatGB(remainingMB) : "-"}</span>
                            <span className="text-slate-400">{s.activeBundle && totalMB ? formatGB(totalMB) : ""}</span>
                          </div>
                        </div>

                        <Button className="mt-4 bg-indigo-600 hover:bg-indigo-700" onClick={() => navigate("/client/orders")}>
                          Order Data Bundle
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
      
      {/* Recent Bundles or Warnings can go here */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4">Updates & Alerts</h2>
        <div className="glass-card p-5">
           <p className="text-sm font-medium text-slate-600">No new alerts right now. You're doing great!</p>
        </div>
      </section>
    </div>
  );
}
