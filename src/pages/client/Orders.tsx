import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { format } from "date-fns";

type OrderRow = {
  id: string;
  packageId: string;
  simId: string;
  simPhoneNumber: string;
  simNetwork: string;
  reference: string;
  status: "pending" | "completed" | "rejected";
  amount: number;
  packageName: string;
  createdAt: string;
};

export default function ClientOrders() {
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<any[]>([]);
  const [sims, setSims] = useState<any[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [selectedSimId, setSelectedSimId] = useState<string>("");
  const [ordering, setOrdering] = useState(false);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [dataPkgRes, simRes, topupOrdersRes] = await Promise.all([
        api<{ packages: any[] }>("/api/packages?activeOnly=true"),
        api<{ sims: any[] }>("/api/client/sims"),
        api<{ orders: OrderRow[] }>("/api/client/orders"),
      ]);
      setPackages(dataPkgRes.packages);
      setSims(simRes.sims);
      setOrders(topupOrdersRes.orders);
    } catch (e) {
      console.error(e);
      alert("Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    if (!selectedSimId) {
      alert("Please select a SIM card to top-up.");
      return;
    }
    setOrdering(true);
    try {
      await api("/api/client/orders", {
        method: "POST",
        body: JSON.stringify({ packageId: selectedPkg.id, simId: selectedSimId }),
      });
      alert("Your top-up order has been successfully submitted to the admin for processing.");
      setSelectedPkg(null);
      setSelectedSimId("");
      const ordersRes = await api<{ orders: OrderRow[] }>("/api/client/orders");
      setOrders(ordersRes.orders);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to place order: ${e?.code || e?.message || "request_failed"}.`);
    } finally {
      setOrdering(false);
    }
  };

  if (loading) return <div className="p-8">Loading orders...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Data Orders</h2>
        <p className="text-sm text-slate-500 mt-1">Top-up data bundles and track your order history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {packages.map((pkg, i) => {
          const borders = ["border-t-indigo-500", "border-t-purple-500", "border-t-slate-800", "border-t-emerald-500"];
          const borderClass = borders[i % borders.length];
          return (
            <div key={pkg.id} className={`glass-card p-5 text-center border-t-4 flex flex-col ${borderClass}`}>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{pkg.name}</p>
              <h3 className="text-2xl font-black my-2">
                {pkg.amountMB >= 1024 ? `${(pkg.amountMB / 1024).toFixed(1)} GB` : `${pkg.amountMB} MB`}
                <span className="text-sm font-normal ml-1 text-slate-500">{pkg.durationDays} Days</span>
              </h3>
              <p className="text-lg font-bold text-slate-800 mb-2">R {Number(pkg.price).toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 mb-4 h-8">{pkg.description}</p>
              <button
                className="w-full mt-auto py-2 border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold rounded-lg transition-colors"
                onClick={() => setSelectedPkg(pkg)}
              >
                Order / Top-Up
              </button>
            </div>
          );
        })}
      </div>

      {selectedPkg && (
        <Dialog
          open={!!selectedPkg}
          onOpenChange={() => {
            setSelectedPkg(null);
            setSelectedSimId("");
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order Data Bundle Top-Up</DialogTitle>
              <DialogDescription>
                You are about to submit an order for <strong>{selectedPkg.name}</strong> at R{Number(selectedPkg.price).toFixed(2)}.
              </DialogDescription>
            </DialogHeader>
            <div className="px-1 py-4 space-y-4">
              <div>
                <Label>Payment Reference</Label>
                <p className="text-sm text-slate-500 mt-1">
                  Please select the SIM card you want to top-up. <b>Its Phone Number will act as your Payment Reference.</b>
                </p>
              </div>
              <Select value={selectedSimId} onValueChange={setSelectedSimId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target SIM card..." />
                </SelectTrigger>
                <SelectContent>
                  {sims.length === 0 && (
                    <SelectItem value="disabled" disabled>
                      No active SIM cards found
                    </SelectItem>
                  )}
                  {sims.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.phoneNumber} - {s.network}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPkg(null)} disabled={ordering}>
                Cancel
              </Button>
              <Button onClick={handlePurchase} disabled={ordering || !selectedSimId}>
                {ordering ? "Placing Order..." : "Submit Top-Up Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">My Top-Up Orders</h3>
          <Button variant="outline" size="sm" onClick={loadAll}>
            Refresh
          </Button>
        </div>

        {orders.length === 0 ? (
          <div className="text-sm text-slate-500">No orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>SIM</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-slate-600">
                      {o.createdAt ? format(new Date(o.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {o.simPhoneNumber} {o.simNetwork ? `(${o.simNetwork})` : ""}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800">{o.packageName}</TableCell>
                    <TableCell className="text-sm text-slate-800">R {Number(o.amount).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-slate-600">{o.reference || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          o.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : o.status === "rejected"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }
                      >
                        {o.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
