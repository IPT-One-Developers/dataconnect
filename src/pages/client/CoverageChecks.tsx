import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { formatAddress, SA_PROVINCES } from "../../lib/utils";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { format } from "date-fns";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "EFT / Bank Transfer",
  payfast: "PayFast",
  yoco: "Yoco",
  payat: "Pay@",
};

type CoverageRequest = {
  id: string;
  networkPreference: string;
  address: string;
  notes: string;
  status: "open" | "responded" | "closed";
  adminComment: string;
  suggestedPackageIds: string[];
  createdAt: string;
};

type LtePackageRow = {
  id: string;
  name: string;
  description?: string | null;
  dataCapGB?: number | null;
  speedMbps?: number | null;
  durationDays?: number | null;
  price?: number | null;
};

export default function ClientCoverageChecks() {
  const { user } = useAuthStore();
  const [coverageRequests, setCoverageRequests] = useState<CoverageRequest[]>([]);
  const [ltePackages, setLtePackages] = useState<LtePackageRow[]>([]);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [isCoverageDialogOpen, setIsCoverageDialogOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<CoverageRequest | null>(null);
  const [viewMode, setViewMode] = useState<"view" | "comment">("view");
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

  const ltePackageById = useMemo(() => new Map(ltePackages.map((p) => [p.id, p])), [ltePackages]);
  const [ordering, setOrdering] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [paymentRef, setPaymentRef] = useState<string>("");
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

  const loadData = async () => {
    try {
      setLoading(true);
      const [covRes, lteRes, settingsRes] = await Promise.all([
        api<{ requests: CoverageRequest[] }>("/api/client/coverage-checks"),
        api<{ packages: LtePackageRow[] }>("/api/lte-packages?activeOnly=true"),
        api<{ settings: any }>("/api/company-settings").catch(() => ({ settings: null })),
      ]);
      setCoverageRequests(covRes.requests || []);
      setLtePackages(lteRes.packages || []);
      setCompanySettings(settingsRes.settings);
    } catch (e) {
      console.error(e);
      alert("Failed to load coverage checks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    } catch (e: any) {
      console.error(e);
      alert(`Failed to submit LTE / 5G order: ${e?.code || e?.message || "request_failed"}.`);
    } finally {
      setOrdering(false);
    }
  };

  const openOrderModal = (pkgId: string) => {
    const pkg = ltePackageById.get(pkgId);
    if (!pkg) return;
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
  };

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
      await loadData();
      alert("Coverage check request submitted.");
    } catch (e) {
      console.error(e);
      alert("Failed to submit coverage request.");
    } finally {
      setSubmittingCoverage(false);
    }
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Coverage Checks</h2>
          <p className="text-sm text-slate-500 mt-1">Request LTE / 5G coverage checks and view admin replies.</p>
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
                  <TableHead>Status</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coverageRequests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-slate-600">
                      {r.createdAt ? format(new Date(r.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-sm font-semibold text-slate-800 max-w-[520px] truncate">{r.address}</TableCell>
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
                    <TableCell className="text-xs text-slate-700">
                      {r.adminComment?.trim() || (Array.isArray(r.suggestedPackageIds) && r.suggestedPackageIds.length > 0) ? "Available" : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setViewMode("view");
                          setViewRequest(r);
                        }}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setViewMode("comment");
                          setViewRequest(r);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        Comment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {viewRequest && (
        <Dialog
          open={!!viewRequest}
          onOpenChange={(open) => {
            if (!open) setViewRequest(null);
          }}
        >
          <DialogContent className="sm:max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>{viewMode === "comment" ? "Coverage Check Comment" : "Coverage Check"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2 overflow-y-auto max-h-[60vh] pr-1">
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-slate-600">
                    Created: {viewRequest.createdAt ? format(new Date(viewRequest.createdAt), "yyyy-MM-dd HH:mm") : "-"}
                  </div>
                  <Badge
                    className={
                      viewRequest.status === "closed"
                        ? "bg-slate-100 text-slate-700"
                        : viewRequest.status === "responded"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                    }
                  >
                    {viewRequest.status}
                  </Badge>
                </div>
                {viewMode === "view" ? (
                  <div className="text-slate-600">Network Pref: {viewRequest.networkPreference || "-"}</div>
                ) : null}
                <div className="text-slate-600">
                  <div className="font-semibold text-slate-800 mb-1">Address</div>
                  {String(viewRequest.address || "")
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .map((line, idx) => (
                      <div key={`${line}-${idx}`}>{line}</div>
                    ))}
                </div>
                {viewMode === "view" ? (
                  <div className="text-slate-600">
                    <div className="font-semibold text-slate-800 mb-1">Notes</div>
                    <div className="whitespace-pre-wrap">{viewRequest.notes || "-"}</div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label>Admin Comment</Label>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                  {viewRequest.adminComment?.trim() ? viewRequest.adminComment : "—"}
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Suggested Packages</Label>
                {Array.isArray(viewRequest.suggestedPackageIds) && viewRequest.suggestedPackageIds.length > 0 ? (
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    {viewRequest.suggestedPackageIds
                      .map((id) => ltePackageById.get(id))
                      .filter(Boolean)
                      .map((pkg: any) => (
                        <div key={pkg.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{pkg.name}</div>
                            {typeof pkg.price === "number" ? (
                              <div className="text-xs text-slate-600">R {Number(pkg.price).toFixed(2)}</div>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => {
                              setViewRequest(null);
                              openOrderModal(pkg.id);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700"
                          >
                            Order
                          </Button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">—</div>
                )}
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" type="button" onClick={() => setViewRequest(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isCoverageDialogOpen && (
        <Dialog open={isCoverageDialogOpen} onOpenChange={setIsCoverageDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Request Coverage Check</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2 overflow-y-auto max-h-[60vh] pr-1">
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
                <Input value={coverageForm.notes} onChange={(e) => setCoverageForm({ ...coverageForm, notes: e.target.value })} placeholder="Optional" />
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
          <DialogContent className="sm:max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Order LTE / 5G Package</DialogTitle>
            </DialogHeader>
            <div className="px-1 py-4 space-y-4 overflow-y-auto max-h-[60vh] pr-1">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{selectedPkg.name}</div>
                  <div className="font-bold">Total: R {(Number(selectedPkg.price || 0) + deliveryFee).toFixed(2)}</div>
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Package: R {Number(selectedPkg.price || 0).toFixed(2)} • Delivery/Activation: R {deliveryFee.toFixed(2)}
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
                  <Input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} placeholder="Apartment, unit, etc. (optional)" />
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
                      {(v) => (v ? PAYMENT_METHOD_LABELS[String(v)] ?? String(v) : "Select payment method...")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">EFT / Bank Transfer</SelectItem>
                    {Array.isArray(companySettings?.payment_processors) &&
                      companySettings.payment_processors.map((p: any) => {
                        const label = String(p);
                        const v = label === "PayFast" ? "payfast" : label === "Yoco" ? "yoco" : label === "Pay@" ? "payat" : "";
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
    </div>
  );
}
