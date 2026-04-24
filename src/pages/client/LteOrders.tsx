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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "EFT / Bank Transfer",
  payfast: "PayFast",
  yoco: "Yoco",
  payat: "Pay@",
};

export default function ClientLteOrders() {
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [paymentRef, setPaymentRef] = useState<string>("");
  const [payOrder, setPayOrder] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [search, setSearch] = useState("");
  const [filterNetwork, setFilterNetwork] = useState<"all" | "MTN" | "Vodacom" | "Telkom" | "other">("all");
  const [filterCapType, setFilterCapType] = useState<"all" | "capped" | "uncapped">("all");
  const [form, setForm] = useState({
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
  const deliveryFee = 149;
  const createPaymentRef = () => `SC00${Math.floor(100000 + Math.random() * 900000)}`;

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pkgRes, ordersRes, settingsRes] = await Promise.all([
        api<{ packages: any[] }>("/api/lte-packages?activeOnly=true"),
        api<{ orders: any[] }>("/api/client/lte-orders"),
        api<{ settings: any }>("/api/company-settings").catch(() => ({ settings: null })),
      ]);
      setPackages(pkgRes.packages);
      setOrders(ordersRes.orders);
      setCompanySettings(settingsRes.settings);
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
        line1: form.line1,
        line2: form.line2,
        suburb: form.suburb,
        city: form.city,
        province: form.province,
        postalCode: form.postalCode,
      });
      const contactNotes = [
        `Name: ${`${form.firstName} ${form.lastName}`.trim()}`.trim(),
        form.email ? `Email: ${form.email}` : "",
        form.mobile ? `Mobile: ${form.mobile}` : "",
        form.whatsapp ? `WhatsApp: ${form.whatsapp}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const notes = [contactNotes, String(form.notes || "").trim()].filter(Boolean).join("\n\n");
      await api("/api/client/lte-orders", {
        method: "POST",
        body: JSON.stringify({ packageId: selectedPkg.id, address, notes, paymentMethod, reference: paymentRef }),
      });
      alert("Your LTE / 5G order has been submitted.");
      setSelectedPkg(null);
      setPaymentMethod("");
      setConfirmPaid(false);
      setPaymentRef("");
      setForm({
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

      {(() => {
        const providers = ["MTN", "Telkom", "Vodacom"] as const;
        type NetworkKey = (typeof providers)[number] | "other";

        const getNetworkKey = (network: any): NetworkKey => {
          const n = String(network || "").trim().toLowerCase();
          if (!n) return "other";
          if (n.includes("mtn")) return "MTN";
          if (n.includes("voda")) return "Vodacom";
          if (n.includes("telkom") || n.includes("telokom")) return "Telkom";
          return "other";
        };

        const normalizedSearch = search.trim().toLowerCase();
        const getCapType = (pkg: any): "capped" | "uncapped" => (pkg?.dataCapGB === null ? "uncapped" : "capped");
        const matchesFilters = (pkg: any) => {
          const k = getNetworkKey(pkg.network);
          if (filterNetwork !== "all" && k !== filterNetwork) return false;
          if (filterCapType !== "all" && getCapType(pkg) !== filterCapType) return false;
          if (normalizedSearch) {
            const hay = `${String(pkg.name || "")} ${String(pkg.description || "")} ${String(pkg.fup || "")}`.toLowerCase();
            if (!hay.includes(normalizedSearch)) return false;
          }
          return true;
        };

        const visiblePackages = packages.filter(matchesFilters);
        const byNetwork: Record<NetworkKey, any[]> = { MTN: [], Telkom: [], Vodacom: [], other: [] };
        for (const pkg of visiblePackages) {
          const k = getNetworkKey(pkg.network);
          byNetwork[k].push(pkg);
        }

        const allSections: { key: NetworkKey; title: string; items: any[] }[] = [
          ...providers.map((p) => ({ key: p, title: `${p} LTE / 5G Packages`, items: byNetwork[p] })),
          { key: "other", title: "Other LTE / 5G Packages", items: byNetwork.other },
        ];
        const sections = filterNetwork === "all" ? allSections : allSections.filter((s) => s.key === filterNetwork);

        return (
          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
                  List View
                </Button>
                <Button variant={viewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setViewMode("card")}>
                  Card View
                </Button>
              </div>

              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
                <Input
                  placeholder="Search by name, description, or FUP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full md:w-[320px]"
                />
                <Select value={filterNetwork} onValueChange={(v) => setFilterNetwork(v as any)}>
                  <SelectTrigger className="w-full md:w-[160px]">
                    <SelectValue placeholder="Network" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Networks</SelectItem>
                    <SelectItem value="MTN">MTN</SelectItem>
                    <SelectItem value="Vodacom">Vodacom</SelectItem>
                    <SelectItem value="Telkom">Telkom</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterCapType} onValueChange={(v) => setFilterCapType(v as any)}>
                  <SelectTrigger className="w-full md:w-[170px]">
                    <SelectValue placeholder="Cap Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cap Types</SelectItem>
                    <SelectItem value="capped">Capped</SelectItem>
                    <SelectItem value="uncapped">Uncapped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {visiblePackages.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No LTE / 5G packages match your search/filter.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {sections.map((section) => (
                  <div key={section.key} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                        <Badge variant="outline">{section.items.length}</Badge>
                      </div>
                    </div>

                    {viewMode === "list" ? (
                      <div className="overflow-hidden rounded-lg border border-slate-100">
                        <Table>
                          <TableHeader className="bg-slate-50/50">
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Cap</TableHead>
                              <TableHead>Speed</TableHead>
                              <TableHead>Price (R)</TableHead>
                              <TableHead>Duration</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.items.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-slate-500 text-sm">
                                  No packages in this section.
                                </TableCell>
                              </TableRow>
                            ) : (
                              section.items.map((pkg) => (
                                <TableRow key={pkg.id}>
                                  <TableCell className="font-medium">{pkg.name}</TableCell>
                                  <TableCell className="text-xs text-slate-600 max-w-[340px] truncate">{pkg.description || "-"}</TableCell>
                                  <TableCell>{pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`}</TableCell>
                                  <TableCell>{pkg.speedMbps === null || pkg.speedMbps === undefined ? "-" : `${pkg.speedMbps} Mbps`}</TableCell>
                                  <TableCell>R{Number(pkg.price).toFixed(2)}</TableCell>
                                  <TableCell>{Number(pkg.durationDays)} Days</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const fullName = String(user?.name || "").trim();
                                        const parts = fullName ? fullName.split(/\s+/) : [];
                                        const firstName = parts[0] || "";
                                        const lastName = parts.slice(1).join(" ");
                                        setSelectedPkg(pkg);
                                        setPaymentRef(createPaymentRef());
                                        setPaymentMethod("");
                                        setConfirmPaid(false);
                                        setForm({
                                          firstName,
                                          lastName,
                                          email: String(user?.email || ""),
                                          mobile: String(user?.phone || ""),
                                          whatsapp: String(user?.phone || ""),
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
                                      Order
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {section.items.length === 0 ? (
                          <div className="text-sm text-slate-500">No packages in this section.</div>
                        ) : (
                          section.items.map((pkg) => (
                            <div key={pkg.id} className="rounded-xl border border-slate-100 bg-white p-4 flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate">{pkg.name}</div>
                                  <div className="text-xs text-slate-500">
                                    <div>{pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`}</div>
                                    <span>{Number(pkg.durationDays)} Days</span>
                                  </div>
                                </div>
                              </div>

                              {pkg.description ? <div className="text-xs text-slate-600 max-h-12 overflow-hidden">{pkg.description}</div> : null}

                              <div className="flex items-center justify-between pt-1">
                                <div className="text-sm font-black text-slate-900">R{Number(pkg.price).toFixed(2)}</div>
                                <div className="text-xs text-slate-500">
                                  {pkg.speedMbps === null || pkg.speedMbps === undefined ? "-" : `${pkg.speedMbps} Mbps`}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 pt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => {
                                    const fullName = String(user?.name || "").trim();
                                    const parts = fullName ? fullName.split(/\s+/) : [];
                                    const firstName = parts[0] || "";
                                    const lastName = parts.slice(1).join(" ");
                                    setSelectedPkg(pkg);
                                    setPaymentRef(createPaymentRef());
                                    setPaymentMethod("");
                                    setConfirmPaid(false);
                                    setForm({
                                      firstName,
                                      lastName,
                                      email: String(user?.email || ""),
                                      mobile: String(user?.phone || ""),
                                      whatsapp: String(user?.phone || ""),
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
                                  Order LTE / 5G
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
                  <TableHead>Totals</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Admin Comment</TableHead>
                  <TableHead className="text-right">Payment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const packageAmount =
                    typeof o.packageAmount === "number"
                      ? o.packageAmount
                      : typeof o.package_amount === "number"
                        ? o.package_amount
                        : Math.max(0, Number(o.amount || 0) - deliveryFee);
                  const totalAmount = Number(o.amount || 0);
                  const reference = String(o.reference || o.paymentReference || "");
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="text-xs text-slate-600">
                        {o.createdAt ? format(new Date(o.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                      </TableCell>
                      <TableCell className="text-sm font-semibold text-slate-800">{o.packageName}</TableCell>
                      <TableCell className="text-sm text-slate-800">
                        <div className="font-semibold">R {totalAmount.toFixed(2)}</div>
                        <div className="text-xs text-slate-500">
                          Package: R {packageAmount.toFixed(2)} • Delivery/Activation: R {deliveryFee.toFixed(2)}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-slate-600">{reference || "-"}</TableCell>
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
                      <TableCell className="text-right">
                        {o.status === "pending" ? (
                          <Button variant="outline" size="sm" onClick={() => setPayOrder(o)}>
                            Make Payment
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
            setPaymentMethod("");
            setConfirmPaid(false);
            setPaymentRef("");
            setForm({
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
          }}
        >
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Order LTE / 5G Package</DialogTitle>
              <DialogDescription>
                Sim Card, Activation and Delivery is <b>R149.00</b>. Please make payment before submitting your order.
              </DialogDescription>
            </DialogHeader>
            <div className="px-1 py-4 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{selectedPkg.name}</div>
                  <div className="font-bold">
                    Total: R {(Number(selectedPkg.price) + deliveryFee).toFixed(2)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Package: R {Number(selectedPkg.price).toFixed(2)} • Delivery/Activation: R {deliveryFee.toFixed(2)}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Name</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Name" />
                </div>
                <div className="grid gap-2">
                  <Label>Surname</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Surname" />
                </div>
                <div className="grid gap-2">
                  <Label>Email Address</Label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email address" />
                </div>
                <div className="grid gap-2">
                  <Label>Mobile No</Label>
                  <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="Mobile number" />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label>WhatsApp Number</Label>
                  <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="WhatsApp number" />
                </div>
              </div>

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

              <div className="space-y-2">
                <Label>Payment Reference</Label>
                <div className="text-sm text-slate-700 font-mono">{paymentRef || "-"}</div>
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
              <Button variant="outline" onClick={() => setSelectedPkg(null)} disabled={ordering}>
                Cancel
              </Button>
              <Button onClick={submitOrder} disabled={ordering || !paymentMethod || !confirmPaid}>
                {ordering ? "Submitting..." : "Submit LTE / 5G Order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog
        open={!!payOrder}
        onOpenChange={(open) => {
          if (!open) setPayOrder(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Payment</DialogTitle>
            <DialogDescription>Use the reference below when making payment.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Payment Reference</Label>
              <div className="mt-1 text-sm text-slate-700 font-mono">{String(payOrder?.reference || "-")}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{String(payOrder?.packageName || "")}</div>
                <div className="font-bold">Total: R {Number(payOrder?.amount || 0).toFixed(2)}</div>
              </div>
            </div>
            {companySettings?.banking_details ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 whitespace-pre-line">
                {String(companySettings.banking_details)}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPayOrder(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
