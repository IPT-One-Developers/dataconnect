import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatAddress, SA_PROVINCES } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { format } from "date-fns";

export default function ClientLteOrders() {
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [form, setForm] = useState({
    line1: "",
    line2: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    notes: "",
  });

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pkgRes, ordersRes] = await Promise.all([
        api<{ packages: any[] }>("/api/lte-packages?activeOnly=true"),
        api<{ orders: any[] }>("/api/client/lte-orders"),
      ]);
      setPackages(pkgRes.packages);
      setOrders(ordersRes.orders);
    } catch (e) {
      console.error(e);
      alert("Failed to load LTE / 5G orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  const submitOrder = async () => {
    if (!selectedPkg) return;
    if (!form.line1.trim() || !form.city.trim() || !form.province.trim() || !form.postalCode.trim()) {
      alert("Please enter a full address (street, city, province, and postal code).");
      return;
    }
    setOrdering(true);
    try {
      const address = formatAddress({
        line1: form.line1,
        line2: form.line2,
        suburb: form.suburb,
        city: form.city,
        province: form.province,
        postalCode: form.postalCode,
      });
      await api("/api/client/lte-orders", {
        method: "POST",
        body: JSON.stringify({ packageId: selectedPkg.id, address, notes: form.notes }),
      });
      alert("Your LTE / 5G order has been submitted.");
      setSelectedPkg(null);
      setForm({
        line1: "",
        line2: "",
        suburb: "",
        city: "",
        province: "",
        postalCode: "",
        notes: "",
      });
      const ordersRes = await api<{ orders: any[] }>("/api/client/lte-orders");
      setOrders(ordersRes.orders);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to submit LTE / 5G order: ${e?.code || e?.message || "request_failed"}.`);
    } finally {
      setOrdering(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">LTE / 5G Orders</h2>
        <p className="text-sm text-slate-500 mt-1">Order LTE / 5G packages and track your order history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {packages.map((pkg, i) => {
          const borders = ["border-t-indigo-500", "border-t-purple-500", "border-t-slate-800", "border-t-emerald-500"];
          const borderClass = borders[i % borders.length];
          return (
            <div key={pkg.id} className={`glass-card p-5 text-center border-t-4 flex flex-col ${borderClass}`}>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{pkg.name}</p>
              <h3 className="text-xl font-black my-2">
                {pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`}
                <span className="text-sm font-normal ml-1 text-slate-500">{pkg.durationDays} Days</span>
              </h3>
              <p className="text-sm text-slate-600">{pkg.speedMbps === null ? "-" : `${pkg.speedMbps} Mbps`}</p>
              <p className="text-lg font-bold text-slate-800 mb-2 mt-2">R {Number(pkg.price).toFixed(2)}</p>
              <p className="text-[10px] text-slate-400 mb-4 h-8">{pkg.description}</p>
              <button
                className="w-full mt-auto py-2 border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold rounded-lg transition-colors"
                onClick={() => setSelectedPkg(pkg)}
              >
                Order LTE / 5G
              </button>
            </div>
          );
        })}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">My LTE / 5G Orders</h3>
          <Button variant="outline" size="sm" onClick={loadAll}>
            Refresh
          </Button>
        </div>

        {orders.length === 0 ? (
          <div className="text-sm text-slate-500">No LTE / 5G orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-slate-600">
                      {o.createdAt ? format(new Date(o.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800">{o.packageName}</TableCell>
                    <TableCell className="text-sm text-slate-800">R {Number(o.amount).toFixed(2)}</TableCell>
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
                    <TableCell className="text-xs text-slate-700">{o.adminComment || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedPkg && (
        <Dialog
          open={!!selectedPkg}
          onOpenChange={() => {
            setSelectedPkg(null);
            setForm({
              line1: "",
              line2: "",
              suburb: "",
              city: "",
              province: "",
              postalCode: "",
              notes: "",
            });
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order LTE / 5G Package</DialogTitle>
              <DialogDescription>
                You are about to submit an order for <strong>{selectedPkg.name}</strong> at R{Number(selectedPkg.price).toFixed(2)}.
              </DialogDescription>
            </DialogHeader>
            <div className="px-1 py-4 space-y-4">
              <div className="grid gap-2">
                <Label>Address</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} placeholder="Street address" />
                  <Input
                    value={form.line2}
                    onChange={(e) => setForm({ ...form, line2: e.target.value })}
                    placeholder="Apartment, unit, etc. (optional)"
                  />
                  <Input value={form.suburb} onChange={(e) => setForm({ ...form, suburb: e.target.value })} placeholder="Suburb (optional)" />
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City / Town" />
                  <Select value={form.province} onValueChange={(v) => setForm({ ...form, province: v })}>
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
                  <Input value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} placeholder="Postal code" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPkg(null)} disabled={ordering}>
                Cancel
              </Button>
              <Button onClick={submitOrder} disabled={ordering}>
                {ordering ? "Submitting..." : "Submit LTE / 5G Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
