import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { format } from "date-fns";

type CoverageStatus = "open" | "responded" | "closed";

type CoverageRequest = {
  id: string;
  createdAt: string;
  userEmail: string;
  address: string;
  notes?: string | null;
  networkPreference?: string | null;
  status: CoverageStatus;
  adminComment?: string | null;
  suggestedPackageIds?: string[] | null;
};

type LtePackageRow = {
  id: string;
  name: string;
  price: number;
};

export default function AdminCoverageChecks() {
  const [status, setStatus] = useState<CoverageStatus>("open");
  const [requests, setRequests] = useState<CoverageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [replyFilter, setReplyFilter] = useState<"all" | "replied" | "not_replied">("all");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<CoverageRequest | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [coverageStatus, setCoverageStatus] = useState<CoverageStatus>("responded");
  const [ltePackages, setLtePackages] = useState<LtePackageRow[]>([]);
  const [suggestedPackageIds, setSuggestedPackageIds] = useState<string[]>([]);

  const ltePackageById = useMemo(() => new Map(ltePackages.map((p) => [p.id, p])), [ltePackages]);
  const filteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesQuery = (r: CoverageRequest) => {
      if (!q) return true;
      const hay = [
        r.userEmail,
        r.address,
        r.networkPreference || "",
        r.notes || "",
        r.adminComment || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };
    const hasReply = (r: CoverageRequest) => {
      const hasComment = Boolean(String(r.adminComment || "").trim());
      const hasSuggested = Array.isArray(r.suggestedPackageIds) && r.suggestedPackageIds.length > 0;
      return hasComment || hasSuggested || r.status !== "open";
    };
    return requests.filter((r) => {
      if (!matchesQuery(r)) return false;
      if (replyFilter === "all") return true;
      const replied = hasReply(r);
      return replyFilter === "replied" ? replied : !replied;
    });
  }, [requests, search, replyFilter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await api<{ requests: CoverageRequest[] }>(`/api/admin/coverage-checks?status=${encodeURIComponent(status)}`);
      setRequests(res.requests || []);
    } catch (e) {
      console.error(e);
      alert("Failed to load coverage checks");
    } finally {
      setLoading(false);
    }
  };

  const ensureLtePackages = async () => {
    if (ltePackages.length > 0) return;
    try {
      const res = await api<{ packages: LtePackageRow[] }>("/api/lte-packages?activeOnly=true");
      setLtePackages(res.packages || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [status]);

  const openRequest = async (req: CoverageRequest) => {
    setActiveRequest(req);
    setAdminComment(req.adminComment || "");
    setSuggestedPackageIds(Array.isArray(req.suggestedPackageIds) ? req.suggestedPackageIds : []);
    setCoverageStatus(req.status || "responded");
    await ensureLtePackages();
    setIsDialogOpen(true);
  };

  const saveReply = async () => {
    if (!activeRequest) return;
    try {
      await api(`/api/admin/coverage-checks/${activeRequest.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: coverageStatus, adminComment, suggestedPackageIds }),
      });
      setIsDialogOpen(false);
      setActiveRequest(null);
      setAdminComment("");
      setSuggestedPackageIds([]);
      await loadRequests();
    } catch (e) {
      console.error(e);
      alert("Failed to save changes");
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Coverage Checks</h2>
        <p className="text-sm text-slate-500 mt-1">Review coverage checks and reply with comments and LTE / 5G service options.</p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {(["open", "responded", "closed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`px-3 py-2 text-xs font-bold ${status === s ? "bg-indigo-600 text-white" : "bg-white text-slate-700"}`}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {(["all", "replied", "not_replied"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`px-3 py-2 text-xs font-bold ${replyFilter === f ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
                onClick={() => setReplyFilter(f)}
              >
                {f === "all" ? "All" : f === "replied" ? "Replied" : "Not Replied"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 min-w-[260px]">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email, address, notes..." />
            {search.trim() ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear
              </Button>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={loadRequests}>
            Refresh
          </Button>
          <div className="text-xs text-slate-500">
            Showing {filteredRequests.length} / {requests.length}
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client Email</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Network Pref</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                  No coverage checks found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRequests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-slate-500">{r.createdAt ? format(new Date(r.createdAt), "PP p") : "-"}</TableCell>
                  <TableCell className="font-medium">{r.userEmail}</TableCell>
                  <TableCell className="text-sm">{r.address}</TableCell>
                  <TableCell className="text-sm">{r.networkPreference || "-"}</TableCell>
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
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => openRequest(r)} className="bg-indigo-600 hover:bg-indigo-700">
                      View / Reply
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {isDialogOpen && activeRequest && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Coverage Check</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-2 overflow-y-auto max-h-[60vh] pr-1">
              <div className="grid gap-2 text-sm">
                <div className="font-semibold text-slate-800">{activeRequest.userEmail}</div>
                <div className="text-slate-600">
                  {String(activeRequest.address || "")
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line, idx) => (
                      <div key={`${line}-${idx}`}>{line}</div>
                    ))}
                </div>
                {activeRequest.networkPreference ? <div className="text-slate-600">Network Pref: {activeRequest.networkPreference}</div> : null}
                {activeRequest.notes ? <div className="text-slate-600">Notes: {activeRequest.notes}</div> : null}
              </div>

              <div className="grid gap-2">
                <Label>Status</Label>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  {(["responded", "closed", "open"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`px-3 py-2 text-xs font-bold ${coverageStatus === s ? "bg-indigo-600 text-white" : "bg-white text-slate-700"}`}
                      onClick={() => setCoverageStatus(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Admin Comment</Label>
                <textarea
                  rows={4}
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Optional"
                />
              </div>

              <div className="grid gap-2">
                <Label>Available LTE / 5G Services</Label>
                <div className="space-y-2 max-h-56 overflow-auto rounded-lg border border-slate-200 p-3">
                  {ltePackages.length === 0 ? (
                    <div className="text-sm text-slate-500">No active LTE / 5G packages found.</div>
                  ) : (
                    ltePackages.map((p) => {
                      const checked = suggestedPackageIds.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-800">
                            {p.name} <span className="text-slate-500 font-normal">R {Number(p.price).toFixed(2)}</span>
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSuggestedPackageIds((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
                            }}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
                {suggestedPackageIds.length > 0 ? (
                  <div className="text-xs text-slate-500">
                    Selected:{" "}
                    {suggestedPackageIds
                      .map((id) => ltePackageById.get(id)?.name)
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setActiveRequest(null);
                  setAdminComment("");
                  setSuggestedPackageIds([]);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveReply}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
