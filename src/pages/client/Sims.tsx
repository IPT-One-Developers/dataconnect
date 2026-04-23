import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatAddress, SA_PROVINCES } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { format } from "date-fns";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "EFT / Bank Transfer",
  payfast: "PayFast",
  yoco: "Yoco",
  payat: "Pay@",
};

export default function ClientSims() {
  const { user } = useAuthStore();
  const [sims, setSims] = useState<any[]>([]);
  const [simOrders, setSimOrders] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [addingSim, setAddingSim] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [byoSimForm, setByoSimForm] = useState({ phoneNumber: "" });
  const [orderForm, setOrderForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    whatsapp: "",
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
    try {
      setLoading(true);
      const [simRes, simOrdersRes] = await Promise.all([
        api<{ sims: any[] }>("/api/client/sims"),
        api<{ orders: any[] }>("/api/client/sim-orders"),
      ]);
      setSims(simRes.sims);
      setSimOrders(simOrdersRes.orders);
      try {
        const settingsRes = await api<{ settings: any }>("/api/company-settings");
        setCompanySettings(settingsRes.settings);
      } catch {
        setCompanySettings(null);
      }

      setOrderForm((prev) => ({
        ...prev,
        email: prev.email || String(user?.email || ""),
        mobile: prev.mobile || String(user?.phone || ""),
        whatsapp: prev.whatsapp || String(user?.phone || ""),
        firstName: prev.firstName || String(user?.name || "").trim().split(/\s+/)[0] || "",
        lastName: prev.lastName || String(user?.name || "").trim().split(/\s+/).slice(1).join(" "),
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  if (loading) return <div className="p-8">Loading...</div>;

  const submitSimOrder = async () => {
    if (!orderForm.line1.trim() || !orderForm.city.trim() || !orderForm.province.trim() || !orderForm.postalCode.trim()) {
      alert("Please enter a full delivery address (street, city, province, and postal code).");
      return;
    }
    if (!paymentMethod) {
      alert("Please select a payment method.");
      return;
    }
    if (!confirmPaid) {
      alert("Please confirm that you have made payment.");
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
        body: JSON.stringify({
          address,
          notes: [orderForm.notes, `Name: ${`${orderForm.firstName} ${orderForm.lastName}`.trim()}`.trim(), orderForm.email ? `Email: ${orderForm.email}` : "", orderForm.mobile ? `Mobile: ${orderForm.mobile}` : "", orderForm.whatsapp ? `WhatsApp: ${orderForm.whatsapp}` : ""]
            .filter(Boolean)
            .join("\n"),
          paymentMethod,
        }),
      });
      alert("Your SIM order has been submitted.");
      setOrderForm((prev) => ({
        ...prev,
        line1: "",
        line2: "",
        suburb: "",
        city: "",
        province: "",
        postalCode: "",
        notes: "",
      }));
      setConfirmOpen(false);
      setPaymentMethod("");
      setConfirmPaid(false);
      const res = await api<{ orders: any[] }>("/api/client/sim-orders");
      setSimOrders(res.orders);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to submit SIM order: ${e?.code || e?.message || "request_failed"}.`);
    } finally {
      setOrdering(false);
    }
  };

  const addOwnSim = async () => {
    const phoneNumber = String(byoSimForm.phoneNumber || "").trim();
    if (!phoneNumber) {
      alert("Please enter your MTN phone number.");
      return;
    }
    setAddingSim(true);
    try {
      await api("/api/client/sims", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      });
      setByoSimForm({ phoneNumber: "" });
      await loadAll();
      alert("Your MTN SIM has been added. You can now place Data Bundle top-up orders for it.");
    } catch (e: any) {
      console.error(e);
      const code = String(e?.code || e?.message || "");
      if (code === "already_exists") {
        alert("This SIM is already added.");
        return;
      }
      alert(`Failed to add SIM: ${code || "request_failed"}.`);
    } finally {
      setAddingSim(false);
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
          <h3 className="text-sm font-bold text-slate-800">Bring Your Own SIM (MTN)</h3>
          <p className="text-xs text-slate-500 mt-1">
            Add your own MTN SIM card for <b>Data Bundle orders only</b>. LTE / 5G orders are not supported for BYO SIM.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>MTN Phone Number</Label>
            <Input
              value={byoSimForm.phoneNumber}
              onChange={(e) => setByoSimForm({ ...byoSimForm, phoneNumber: e.target.value })}
              placeholder="e.g. 27xxxxxxxxx"
            />
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Note: Only MTN SIM cards are supported. Please ensure the phone number is correct so the admin can allocate bundles.
        </div>
        <div className="flex justify-end">
          <Button onClick={addOwnSim} disabled={addingSim}>
            {addingSim ? "Adding..." : "Add MTN SIM"}
          </Button>
        </div>
      </div>

      <div className="glass-card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Request a SIM Card</h3>
          <p className="text-xs text-slate-500 mt-1">Submit a SIM order to the admin for processing.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={orderForm.firstName}
              onChange={(e) => setOrderForm({ ...orderForm, firstName: e.target.value })}
              placeholder="Name"
            />
          </div>
          <div className="grid gap-2">
            <Label>Surname</Label>
            <Input
              value={orderForm.lastName}
              onChange={(e) => setOrderForm({ ...orderForm, lastName: e.target.value })}
              placeholder="Surname"
            />
          </div>
          <div className="grid gap-2">
            <Label>Email Address</Label>
            <Input
              value={orderForm.email}
              onChange={(e) => setOrderForm({ ...orderForm, email: e.target.value })}
              placeholder="Email address"
            />
          </div>
          <div className="grid gap-2">
            <Label>Mobile No</Label>
            <Input
              value={orderForm.mobile}
              onChange={(e) => setOrderForm({ ...orderForm, mobile: e.target.value })}
              placeholder="Mobile number"
            />
          </div>
          <div className="grid gap-2">
            <Label>WhatsApp No</Label>
            <Input
              value={orderForm.whatsapp}
              onChange={(e) => setOrderForm({ ...orderForm, whatsapp: e.target.value })}
              placeholder="WhatsApp number"
            />
          </div>
          <div className="grid gap-2 md:col-span-3">
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
          <Button
            onClick={() => {
              if (!orderForm.line1.trim() || !orderForm.city.trim() || !orderForm.province.trim() || !orderForm.postalCode.trim()) {
                alert("Please enter a full delivery address (street, city, province, and postal code).");
                return;
              }
              setConfirmOpen(true);
            }}
            disabled={ordering}
          >
            {ordering ? "Submitting..." : "Submit SIM Order"}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) {
            setPaymentMethod("");
            setConfirmPaid(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>SIM Order Payment</DialogTitle>
            <DialogDescription>
              All new SIM orders have a once-off fee of <b>R99.00</b>. Please make payment using one of the available options
              before submitting your order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Payment Reference</Label>
              <div className="mt-1 text-sm text-slate-700 font-mono">{user?.phone || "-"}</div>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select payment method...">
                    {(v) =>
                      v ? PAYMENT_METHOD_LABELS[String(v)] ?? String(v) : "Select payment method..."
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">EFT / Bank Transfer</SelectItem>
                  {Array.isArray(companySettings?.payment_processors) &&
                    companySettings.payment_processors.map((p: any) => {
                      const label = String(p);
                      const v =
                        label === "PayFast" ? "payfast" : label === "Yoco" ? "yoco" : label === "Pay@" ? "payat" : "";
                      if (!v) return null;
                      return (
                        <SelectItem key={v} value={v}>
                          {label}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "bank_transfer" ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 whitespace-pre-line">
                {companySettings?.banking_details ? String(companySettings.banking_details) : "Banking details not configured yet."}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={confirmPaid} onChange={(e) => setConfirmPaid(e.target.checked)} />
              I confirm that I have made payment.
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setConfirmOpen(false)} disabled={ordering}>
              Cancel
            </Button>
            <Button type="button" onClick={submitSimOrder} disabled={ordering || !paymentMethod || !confirmPaid}>
              {ordering ? "Submitting..." : "Submit to Admin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
