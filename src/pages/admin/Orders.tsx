import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { format } from "date-fns";

export default function AdminOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<"topups" | "lte" | "sim" | "coverage">("topups");
  const [status, setStatus] = useState<string>("pending");
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<"lte" | "sim" | "coverage" | null>(null);
  const [activeItem, setActiveItem] = useState<any>(null);
  const [adminComment, setAdminComment] = useState("");
  const [ltePackages, setLtePackages] = useState<any[]>([]);
  const [suggestedPackageIds, setSuggestedPackageIds] = useState<string[]>([]);
  const [coverageStatus, setCoverageStatus] = useState<"open" | "responded" | "closed">("responded");
  const [isTopupViewOpen, setIsTopupViewOpen] = useState(false);
  const [topupViewItem, setTopupViewItem] = useState<any>(null);
  const [isTopupConfirmOpen, setIsTopupConfirmOpen] = useState(false);
  const [topupConfirmLoading, setTopupConfirmLoading] = useState(false);
  const [topupConfirmAction, setTopupConfirmAction] = useState<"fulfill" | "reject" | null>(null);
  const [topupConfirmOrder, setTopupConfirmOrder] = useState<any>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      if (view === "topups") {
        const res = await api<{ orders: any[] }>(`/api/admin/orders?status=${encodeURIComponent(status)}`);
        setOrders(res.orders);
        return;
      }
      if (view === "lte") {
        const res = await api<{ orders: any[] }>(`/api/admin/lte-orders?status=${encodeURIComponent(status)}`);
        setOrders(res.orders);
        return;
      }
      if (view === "sim") {
        const res = await api<{ orders: any[] }>(`/api/admin/sim-orders?status=${encodeURIComponent(status)}`);
        setOrders(res.orders);
        return;
      }
      const res = await api<{ requests: any[] }>(`/api/admin/coverage-checks?status=${encodeURIComponent(status)}`);
      setOrders(res.requests);
    } catch (e) {
      console.error(e);
      alert("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const v = new URLSearchParams(location.search).get("view");
    if (v === "topups" || v === "lte" || v === "sim" || v === "coverage") {
      setView(v);
      setStatus(v === "coverage" ? "open" : "pending");
    }
  }, [location.search]);

  useEffect(() => {
    loadOrders();
  }, [view, status]);

  const setViewWithUrl = (nextView: "topups" | "lte" | "sim" | "coverage") => {
    setView(nextView);
    setStatus(nextView === "coverage" ? "open" : "pending");
    const search = nextView === "topups" ? "" : `?view=${nextView}`;
    navigate(`${location.pathname}${search}`, { replace: true });
  };

  const handleFulfillOrder = async (order: any) => {
    try {
      if (view === "topups") {
        await api(`/api/admin/orders/${order.id}/fulfill`, { method: "POST", body: JSON.stringify({}) });
        setNotice({ type: "success", message: "Top-Up successfully processed." });
        loadOrders();
        return;
      }
      setDialogType("lte");
      setActiveItem(order);
      setAdminComment(order.adminComment || "");
      setIsDialogOpen(true);
      loadOrders();
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", message: "Failed to process request." });
      loadOrders();
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    try {
      if (view === "topups") {
        await api(`/api/admin/orders/${orderId}/reject`, { method: "POST", body: JSON.stringify({}) });
        setNotice({ type: "success", message: "Top-Up rejected." });
        loadOrders();
        return;
      }
      if (view === "lte") {
        setDialogType("lte");
        const o = orders.find((x) => x.id === orderId);
        setActiveItem(o);
        setAdminComment(o?.adminComment || "");
        setIsDialogOpen(true);
        return;
      }
      setDialogType("sim");
      const o = orders.find((x) => x.id === orderId);
      setActiveItem(o);
      setAdminComment(o?.adminComment || "");
      setIsDialogOpen(true);
      return;
      loadOrders();
    } catch (e) {
      console.error(e);
      setNotice({ type: "error", message: "Failed to process request." });
    }
  };

  const openTopupConfirm = (action: "fulfill" | "reject", order: any) => {
    setNotice(null);
    setTopupConfirmAction(action);
    setTopupConfirmOrder(order);
    setIsTopupConfirmOpen(true);
  };

  const closeTopupConfirm = () => {
    if (topupConfirmLoading) return;
    setIsTopupConfirmOpen(false);
    setTopupConfirmAction(null);
    setTopupConfirmOrder(null);
  };

  const runTopupConfirm = async () => {
    if (topupConfirmLoading) return;
    if (!topupConfirmAction || !topupConfirmOrder) return;
    setTopupConfirmLoading(true);
    try {
      if (topupConfirmAction === "fulfill") {
        await handleFulfillOrder(topupConfirmOrder);
      } else {
        await handleRejectOrder(String(topupConfirmOrder.id));
      }
      setIsTopupConfirmOpen(false);
      setTopupConfirmAction(null);
      setTopupConfirmOrder(null);
    } finally {
      setTopupConfirmLoading(false);
    }
  };

  const openCoverageDialog = async (req: any) => {
    setDialogType("coverage");
    setActiveItem(req);
    setAdminComment(req.adminComment || "");
    setSuggestedPackageIds(Array.isArray(req.suggestedPackageIds) ? req.suggestedPackageIds : []);
    setCoverageStatus("responded");
    if (ltePackages.length === 0) {
      try {
        const res = await api<{ packages: any[] }>("/api/lte-packages?activeOnly=true");
        setLtePackages(res.packages);
      } catch (e) {
        console.error(e);
      }
    }
    setIsDialogOpen(true);
  };

  const saveDialog = async () => {
    if (!dialogType || !activeItem) return;
    try {
      if (dialogType === "lte") {
        if (activeItem?.id) {
          const action = activeItem._action === "reject" ? "reject" : "fulfill";
          await api(`/api/admin/lte-orders/${activeItem.id}/${action}`, {
            method: "POST",
            body: JSON.stringify({ adminComment }),
          });
        }
      }
      if (dialogType === "sim") {
        if (activeItem?.id) {
          const nextStatus = activeItem._action === "reject" ? "rejected" : "completed";
          await api(`/api/admin/sim-orders/${activeItem.id}`, {
            method: "PUT",
            body: JSON.stringify({ status: nextStatus, adminComment }),
          });
        }
      }
      if (dialogType === "coverage") {
        await api(`/api/admin/coverage-checks/${activeItem.id}`, {
          method: "PUT",
          body: JSON.stringify({ status: coverageStatus, adminComment, suggestedPackageIds }),
        });
      }
      setIsDialogOpen(false);
      setDialogType(null);
      setActiveItem(null);
      setAdminComment("");
      setSuggestedPackageIds([]);
      loadOrders();
    } catch (e) {
      console.error(e);
      alert("Failed to save changes");
    }
  };

  const statusOptions =
    view === "coverage" ? ["open", "responded", "closed"] : ["pending", "completed", "rejected"];

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-100 text-emerald-800"
              : "bg-rose-50 border-rose-100 text-rose-800"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>{notice.message}</div>
            <button type="button" className="text-xs font-bold uppercase tracking-wide opacity-70" onClick={() => setNotice(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {view === "topups"
            ? "Orders"
            : view === "lte"
              ? "LTE / 5G Orders"
              : view === "sim"
                ? "SIM Card Orders"
                : "Coverage Check Requests"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {view === "topups"
            ? "Process client data bundle orders."
            : view === "lte"
              ? "Process LTE / 5G package orders."
              : view === "sim"
                ? "Process SIM card orders."
                : "Review coverage requests and reply with comments and package options."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 items-center">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button
              type="button"
              className={`px-3 py-2 text-xs font-bold ${view === "topups" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
              onClick={() => {
                setViewWithUrl("topups");
              }}
            >
              Top-Ups
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-xs font-bold ${view === "lte" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
              onClick={() => {
                setViewWithUrl("lte");
              }}
            >
              LTE / 5G
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-xs font-bold ${view === "sim" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
              onClick={() => {
                setViewWithUrl("sim");
              }}
            >
              SIM Orders
            </button>
            <button
              type="button"
              className={`px-3 py-2 text-xs font-bold ${view === "coverage" ? "bg-slate-900 text-white" : "bg-white text-slate-700"}`}
              onClick={() => {
                setViewWithUrl("coverage");
              }}
            >
              Coverage
            </button>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            {statusOptions.map((s) => (
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
          <Button variant="outline" size="sm" onClick={loadOrders}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client Email</TableHead>
              <TableHead>{view === "coverage" ? "Address" : "Package / Network"}</TableHead>
              <TableHead>{view === "coverage" ? "Network Pref" : view === "topups" ? "Ref (SIM No.)" : "Status"}</TableHead>
              <TableHead>{view === "coverage" ? "Status" : "Price"}</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    No orders for the selected status.
                 </TableCell>
               </TableRow>
            ) : (
              orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-xs text-slate-500">{format(new Date(o.createdAt), "PP p")}</TableCell>
                  <TableCell className="font-medium">{o.userEmail}</TableCell>
                  <TableCell className="text-sm">
                    {view === "coverage"
                      ? o.address
                      : view === "sim"
                        ? (
                            <div>
                              <div>{o.network || "SIM Order"}</div>
                              {o.reference ? <div className="text-xs font-mono text-slate-500">{o.reference}</div> : null}
                            </div>
                          )
                        : view === "lte"
                          ? (
                              <div>
                                <div>{o.packageName}</div>
                                {o.reference ? <div className="text-xs font-mono text-slate-500">{o.reference}</div> : null}
                              </div>
                            )
                          : o.packageName}
                  </TableCell>
                  <TableCell className={view === "topups" ? "font-mono text-xs font-bold text-indigo-600" : "text-sm"}>
                    {view === "coverage" ? o.networkPreference || "-" : view === "topups" ? o.reference : o.status}
                  </TableCell>
                  <TableCell className="font-bold">
                    {view === "coverage" ? (
                      <Badge
                        className={
                          o.status === "closed"
                            ? "bg-slate-100 text-slate-700"
                            : o.status === "responded"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                        }
                      >
                        {o.status}
                      </Badge>
                    ) : (
                      `R ${Number(o.amount).toFixed(2)}`
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    {view === "coverage" ? (
                      <Button size="sm" onClick={() => openCoverageDialog(o)} className="bg-indigo-600 hover:bg-indigo-700">
                        Reply
                      </Button>
                    ) : view === "topups" ? (
                      <>
                        {String(o.status) === "pending" ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openTopupConfirm("reject", o)}
                              className="text-red-500 hover:text-red-700"
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openTopupConfirm("fulfill", o)}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              Fulfill Top-Up
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTopupViewItem(o);
                              setIsTopupViewOpen(true);
                            }}
                          >
                            View
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveItem({ ...o, _action: "reject" });
                            setDialogType(view === "lte" ? "lte" : "sim");
                            setAdminComment(o.adminComment || "");
                            setIsDialogOpen(true);
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveItem({ ...o, _action: "fulfill" });
                            setDialogType(view === "lte" ? "lte" : "sim");
                            setAdminComment(o.adminComment || "");
                            setIsDialogOpen(true);
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          Mark Completed
                        </Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {isTopupConfirmOpen && (
        <Dialog
          open={isTopupConfirmOpen}
          onOpenChange={(open) => {
            if (!open) closeTopupConfirm();
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
                    topupConfirmAction === "reject" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {topupConfirmAction === "reject" ? "!" : "✓"}
                </span>
                {topupConfirmAction === "reject" ? "Reject Top-Up" : "Confirm Top-Up"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-sm text-slate-600">
              <div>
                {topupConfirmAction === "reject"
                  ? "This will mark the Top-Up as rejected."
                  : "Only confirm once payment has been received. This will complete the Top-Up."}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Reference</div>
                  <div className="font-mono text-slate-900">{String(topupConfirmOrder?.reference || "-")}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Amount</div>
                  <div className="font-bold text-slate-900">R {Number(topupConfirmOrder?.amount || 0).toFixed(2)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Client</div>
                  <div className="max-w-[220px] truncate font-medium text-slate-900">
                    {String(topupConfirmOrder?.userEmail || "-")}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" disabled={topupConfirmLoading} onClick={closeTopupConfirm}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={topupConfirmLoading}
                onClick={runTopupConfirm}
                className={topupConfirmAction === "reject" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}
              >
                {topupConfirmLoading ? "Processing..." : topupConfirmAction === "reject" ? "Reject" : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDialogOpen && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className={dialogType === "coverage" ? "sm:max-w-3xl" : ""}>
            <DialogHeader>
              <DialogTitle>
                {dialogType === "coverage"
                  ? "Coverage Reply"
                  : dialogType === "sim"
                    ? "SIM Order Update"
                    : "LTE / 5G Order Update"}
              </DialogTitle>
            </DialogHeader>

            {dialogType === "coverage" ? (
              <div className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                    {(["responded", "closed", "open"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`px-3 py-2 text-xs font-bold ${
                          coverageStatus === s ? "bg-indigo-600 text-white" : "bg-white text-slate-700"
                        }`}
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
                    placeholder="Type your reply..."
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Suggested Packages</Label>
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
                                setSuggestedPackageIds((prev) =>
                                  prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                                );
                              }}
                            />
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="grid gap-2">
                  <Label>Admin Comment</Label>
                  <Input value={adminComment} onChange={(e) => setAdminComment(e.target.value)} placeholder="Optional" />
                </div>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setDialogType(null);
                  setActiveItem(null);
                  setAdminComment("");
                  setSuggestedPackageIds([]);
                }}
              >
                Cancel
              </Button>
              <Button onClick={saveDialog}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isTopupViewOpen && (
        <Dialog
          open={isTopupViewOpen}
          onOpenChange={(open) => {
            setIsTopupViewOpen(open);
            if (!open) setTopupViewItem(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Top-Up Order</DialogTitle>
            </DialogHeader>

            <div className="space-y-3 pt-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Status</div>
                <Badge
                  className={
                    String(topupViewItem?.status) === "completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : String(topupViewItem?.status) === "rejected"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                  }
                >
                  {String(topupViewItem?.status || "-")}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Client</div>
                <div className="font-medium text-slate-900 truncate max-w-[260px]">{String(topupViewItem?.userEmail || "-")}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Package</div>
                <div className="font-medium text-slate-900 truncate max-w-[260px]">{String(topupViewItem?.packageName || "-")}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Reference (SIM No.)</div>
                <div className="font-mono text-slate-900">{String(topupViewItem?.reference || "-")}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Amount</div>
                <div className="font-bold text-slate-900">R {Number(topupViewItem?.amount || 0).toFixed(2)}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Payment Method</div>
                <div className="text-slate-900">{String(topupViewItem?.paymentMethod || "-")}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-slate-600">Date</div>
                <div className="text-slate-900">
                  {topupViewItem?.createdAt ? format(new Date(topupViewItem.createdAt), "PP p") : "-"}
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setIsTopupViewOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
