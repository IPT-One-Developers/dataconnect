import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatAddress, SA_PROVINCES } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { CalendarClock, Package, Signal, Wifi } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { format } from "date-fns";

export default function ClientDashboard() {
  const { user } = useAuthStore();
  const [sims, setSims] = useState<any[]>([]);
  const [coverageRequests, setCoverageRequests] = useState<any[]>([]);
  const [ltePackages, setLtePackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  const [coverageForm, setCoverageForm] = useState({
    networkPreference: "",
    line1: "",
    line2: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    notes: "",
  });
  const [submittingCoverage, setSubmittingCoverage] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    async function loadData() {
      try {
        setLoading(true);
        const [simsRes, covRes, lteRes] = await Promise.all([
          api<{ sims: any[] }>("/api/client/sims"),
          api<{ requests: any[] }>("/api/client/coverage-checks"),
          api<{ packages: any[] }>("/api/lte-packages?activeOnly=true"),
        ]);
        setSims(simsRes.sims);
        setCoverageRequests(covRes.requests);
        setLtePackages(lteRes.packages);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [user]);

  const submitCoverage = async () => {
    if (!coverageForm.line1.trim() || !coverageForm.city.trim() || !coverageForm.province.trim()) {
      alert("Please enter a full address (street, city, and province).");
      return;
    }
    setSubmittingCoverage(true);
    try {
      const address = formatAddress({
        line1: coverageForm.line1,
        line2: coverageForm.line2,
        suburb: coverageForm.suburb,
        city: coverageForm.city,
        province: coverageForm.province,
        postalCode: coverageForm.postalCode,
      });
      await api("/api/client/coverage-checks", {
        method: "POST",
        body: JSON.stringify({
          networkPreference: coverageForm.networkPreference,
          address,
          notes: coverageForm.notes,
        }),
      });
      setCoverageForm({
        networkPreference: "",
        line1: "",
        line2: "",
        suburb: "",
        city: "",
        province: "",
        postalCode: "",
        notes: "",
      });
      setIsCoverageDialogOpen(false);
      const covRes = await api<{ requests: any[] }>("/api/client/coverage-checks");
      setCoverageRequests(covRes.requests);
      alert("Coverage check request submitted.");
    } catch (e) {
      console.error(e);
      alert("Failed to submit coverage request.");
    } finally {
      setSubmittingCoverage(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  const ltePackageById = new Map(ltePackages.map((p: any) => [p.id, p]));
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sims.map((s: any) => {
                const totalMB = Number(s?.activeBundle?.totalAmountMB ?? 0);
                const remainingMB = Number(s?.activeBundle?.remainingAmountMB ?? 0);
                const pct = totalMB > 0 ? Math.max(0, Math.min(100, (remainingMB / totalMB) * 100)) : 0;
                const expires = s?.activeBundle?.expiryDate ? new Date(s.activeBundle.expiryDate) : null;
                const expiresText = expires && !Number.isNaN(expires.getTime()) ? format(expires, "yyyy-MM-dd") : "-";

                return (
                  <div key={s.id} className="rounded-xl border border-white/50 bg-white/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 truncate">{s.phoneNumber}</div>
                        <div className="text-xs text-slate-600 truncate">{s.network || "-"}</div>
                      </div>
                      <Badge className={s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>
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
                  </div>
                );
              })}
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

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Coverage Check</h2>
            <p className="text-sm text-slate-500 mt-1">Request an LTE / 5G coverage check for your address.</p>
          </div>
          <Button onClick={() => setIsCoverageDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
            Request Check
          </Button>
        </div>

        <div className="glass-card p-5">
          {coverageRequests.length === 0 ? (
            <div className="text-sm text-slate-600">No coverage requests yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Network Pref</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Admin Comment</TableHead>
                    <TableHead>Suggested Packages</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverageRequests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-slate-600">
                        {r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-slate-800">{r.address}</TableCell>
                      <TableCell className="text-xs text-slate-600">{r.networkPreference || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            r.status === "closed"
                              ? "bg-slate-100 text-slate-700"
                              : r.status === "responded"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-700">{r.adminComment || "-"}</TableCell>
                      <TableCell className="text-xs text-slate-700">
                        {Array.isArray(r.suggestedPackageIds) && r.suggestedPackageIds.length > 0
                          ? r.suggestedPackageIds
                              .map((id: string) => ltePackageById.get(id)?.name)
                              .filter(Boolean)
                              .join(", ")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      {isCoverageDialogOpen && (
        <Dialog open={isCoverageDialogOpen} onOpenChange={setIsCoverageDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Coverage Check</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid gap-2">
                <Label>Network Preference</Label>
                <Input
                  value={coverageForm.networkPreference}
                  onChange={(e) => setCoverageForm({ ...coverageForm, networkPreference: e.target.value })}
                  placeholder="e.g. MTN / Vodacom (optional)"
                />
              </div>
              <div className="grid gap-2">
                <Label>Address</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={coverageForm.line1}
                    onChange={(e) => setCoverageForm({ ...coverageForm, line1: e.target.value })}
                    placeholder="Street address"
                  />
                  <Input
                    value={coverageForm.line2}
                    onChange={(e) => setCoverageForm({ ...coverageForm, line2: e.target.value })}
                    placeholder="Apartment, unit, etc. (optional)"
                  />
                  <Input
                    value={coverageForm.suburb}
                    onChange={(e) => setCoverageForm({ ...coverageForm, suburb: e.target.value })}
                    placeholder="Suburb (optional)"
                  />
                  <Input
                    value={coverageForm.city}
                    onChange={(e) => setCoverageForm({ ...coverageForm, city: e.target.value })}
                    placeholder="City / Town"
                  />
                  <Select value={coverageForm.province} onValueChange={(v) => setCoverageForm({ ...coverageForm, province: v })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Province" />
                    </SelectTrigger>
                    <SelectContent>
                      {SA_PROVINCES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={coverageForm.postalCode}
                    onChange={(e) => setCoverageForm({ ...coverageForm, postalCode: e.target.value })}
                    placeholder="Postal code (optional)"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Input
                  value={coverageForm.notes}
                  onChange={(e) => setCoverageForm({ ...coverageForm, notes: e.target.value })}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsCoverageDialogOpen(false)} disabled={submittingCoverage}>
                Cancel
              </Button>
              <Button onClick={submitCoverage} disabled={submittingCoverage}>
                {submittingCoverage ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
