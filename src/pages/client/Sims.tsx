import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatAddress, SA_PROVINCES } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { format } from "date-fns";

export default function ClientSims() {
  const { user } = useAuthStore();
  const [sims, setSims] = useState<any[]>([]);
  const [simOrders, setSimOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [orderForm, setOrderForm] = useState({
    network: "",
    line1: "",
    line2: "",
    suburb: "",
    city: "",
    province: "",
    postalCode: "",
    notes: "",
  });

  useEffect(() => {
    if (!user) return;
    async function loadSims() {
      try {
        setLoading(true);
        const [simRes, simOrdersRes] = await Promise.all([
          api<{ sims: any[] }>("/api/client/sims"),
          api<{ orders: any[] }>("/api/client/sim-orders"),
        ]);
        setSims(simRes.sims);
        setSimOrders(simOrdersRes.orders);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadSims();
  }, [user]);

  if (loading) return <div className="p-8">Loading...</div>;

  const submitSimOrder = async () => {
    if (!orderForm.network.trim()) {
      alert("Please enter a network.");
      return;
    }
    if (!orderForm.line1.trim() || !orderForm.city.trim() || !orderForm.province.trim() || !orderForm.postalCode.trim()) {
      alert("Please enter a full delivery address (street, city, province, and postal code).");
      return;
    }
    setOrdering(true);
    try {
      const address = formatAddress({
        line1: orderForm.line1,
        line2: orderForm.line2,
        suburb: orderForm.suburb,
        city: orderForm.city,
        province: orderForm.province,
        postalCode: orderForm.postalCode,
      });
      await api("/api/client/sim-orders", {
        method: "POST",
        body: JSON.stringify({ network: orderForm.network, address, notes: orderForm.notes }),
      });
      alert("Your SIM order has been submitted.");
      setOrderForm({
        network: "",
        line1: "",
        line2: "",
        suburb: "",
        city: "",
        province: "",
        postalCode: "",
        notes: "",
      });
      const res = await api<{ orders: any[] }>("/api/client/sim-orders");
      setSimOrders(res.orders);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to submit SIM order: ${e?.code || e?.message || "request_failed"}.`);
    } finally {
      setOrdering(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">My SIM Cards</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your active SIM cards and view their network status.</p>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Request a SIM Card</h3>
          <p className="text-xs text-slate-500 mt-1">Submit a SIM order to the admin for processing.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label>Network</Label>
            <Input value={orderForm.network} onChange={(e) => setOrderForm({ ...orderForm, network: e.target.value })} placeholder="e.g. MTN" />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label>Delivery Address</Label>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={orderForm.line1}
                onChange={(e) => setOrderForm({ ...orderForm, line1: e.target.value })}
                placeholder="Street address"
              />
              <Input
                value={orderForm.line2}
                onChange={(e) => setOrderForm({ ...orderForm, line2: e.target.value })}
                placeholder="Apartment, unit, etc. (optional)"
              />
              <Input
                value={orderForm.suburb}
                onChange={(e) => setOrderForm({ ...orderForm, suburb: e.target.value })}
                placeholder="Suburb (optional)"
              />
              <Input
                value={orderForm.city}
                onChange={(e) => setOrderForm({ ...orderForm, city: e.target.value })}
                placeholder="City / Town"
              />
              <Select value={orderForm.province} onValueChange={(v) => setOrderForm({ ...orderForm, province: v })}>
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
                value={orderForm.postalCode}
                onChange={(e) => setOrderForm({ ...orderForm, postalCode: e.target.value })}
                placeholder="Postal code"
              />
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Notes</Label>
          <Input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} placeholder="Optional" />
        </div>
        <div className="flex justify-end">
          <Button onClick={submitSimOrder} disabled={ordering}>
            {ordering ? "Submitting..." : "Submit SIM Order"}
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Phone Number</TableHead>
              <TableHead>ICCID</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sims.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                  No SIM cards found.
                </TableCell>
              </TableRow>
            ) : (
              sims.map(sim => (
                <TableRow key={sim.id}>
                  <TableCell className="font-medium">{sim.phoneNumber}</TableCell>
                  <TableCell className="text-gray-500">{sim.iccid}</TableCell>
                  <TableCell>{sim.network}</TableCell>
                  <TableCell>
                    <Badge variant={sim.status === 'active' ? 'default' : 'secondary'}>
                      {sim.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800">My SIM Orders</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const res = await api<{ orders: any[] }>("/api/client/sim-orders");
                setSimOrders(res.orders);
              } catch (e) {
                console.error(e);
              }
            }}
          >
            Refresh
          </Button>
        </div>

        {simOrders.length === 0 ? (
          <div className="text-sm text-slate-500">No SIM orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Comment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simOrders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-xs text-slate-600">
                      {o.createdAt ? format(new Date(o.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800">{o.network}</TableCell>
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
    </div>
  );
}
