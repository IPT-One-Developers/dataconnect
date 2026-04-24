import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card } from "../../../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { format } from "date-fns";

export default function AdminSims() {
  const [sims, setSims] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [networkFilter, setNetworkFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ userId: '', iccid: '', phoneNumber: '', network: 'MTN', status: 'active' });
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [balanceSim, setBalanceSim] = useState<any>(null);
  const [balanceForm, setBalanceForm] = useState({ packageId: "", expiryDate: "", remainingAmountGB: "" });
  const selectedClient = users.find((u) => u.id === formData.userId) || null;

  const loadData = async () => {
    try {
      setLoading(true);
      const [simsRes, clientsRes, packagesRes] = await Promise.all([
        api<{ sims: any[] }>("/api/admin/sims"),
        api<{ clients: any[] }>("/api/admin/clients"),
        api<{ packages: any[] }>("/api/packages?activeOnly=false"),
      ]);
      setUsers(clientsRes.clients);
      setSims(simsRes.sims);
      setPackages(packagesRes.packages);
    } catch (err) {
      console.error("Failed to load SIM data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      await api("/api/admin/sims", { method: "POST", body: JSON.stringify(formData) });
      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to add SIM card');
    }
  };

  const updateSimStatus = async (simId: string, currentStatus: string) => {
    try {
      await api(`/api/admin/sims/${simId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: currentStatus === "active" ? "inactive" : "active" }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const openBalanceDialog = (sim: any) => {
    setBalanceSim(sim);
    const remainingMB =
      sim?.activeBundle?.remainingAmountMB !== null && sim?.activeBundle?.remainingAmountMB !== undefined
        ? Number(sim.activeBundle.remainingAmountMB)
        : null;
    setBalanceForm({
      packageId: sim?.activeBundle?.packageId || "",
      expiryDate: sim?.activeBundle?.expiryDate ? format(new Date(sim.activeBundle.expiryDate), "yyyy-MM-dd") : "",
      remainingAmountGB: remainingMB !== null && Number.isFinite(remainingMB) ? (remainingMB / 1024).toFixed(2) : "",
    });
    setIsBalanceDialogOpen(true);
  };

  const submitBalanceUpdate = async () => {
    if (!balanceSim?.id) return;
    if (!balanceForm.packageId) return alert("Please select a bundle/package.");
    const remainingAmountGB = Number(balanceForm.remainingAmountGB);
    if (!Number.isFinite(remainingAmountGB) || remainingAmountGB < 0) return alert("Please enter a valid remaining GB.");
    const remainingAmountMB = Math.round(remainingAmountGB * 1024);

    try {
      await api(`/api/admin/sims/${balanceSim.id}/bundle`, {
        method: "PUT",
        body: JSON.stringify({
          packageId: balanceForm.packageId,
          remainingAmountMB,
          expiryDate: balanceForm.expiryDate || undefined,
        }),
      });
      setIsBalanceDialogOpen(false);
      setBalanceSim(null);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to update balance.");
    }
  };

  const isByoSim = (s: any) => String(s?.network || "").toUpperCase() === "MTN" && String(s?.iccid || "").startsWith("99");
  const isLteSim = (s: any) => /(^|\s)(lte|5g)(\s|$)/i.test(String(s?.network || "")) || /lte|5g/i.test(String(s?.network || ""));
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const applyFilters = (sim: any) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      String(sim?.userEmail || "").toLowerCase().includes(normalizedQuery) ||
      String(sim?.phoneNumber || "").toLowerCase().includes(normalizedQuery) ||
      String(sim?.iccid || "").toLowerCase().includes(normalizedQuery) ||
      String(sim?.network || "").toLowerCase().includes(normalizedQuery);

    const simNetwork = String(sim?.network || "");
    const matchesNetwork =
      networkFilter === "all" ||
      (networkFilter === "lte" ? isLteSim(sim) : simNetwork.toLowerCase().startsWith(networkFilter.toLowerCase()));
    const matchesStatus = statusFilter === "all" || String(sim?.status || "") === statusFilter;
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "byo" ? isByoSim(sim) : typeFilter === "lte" ? isLteSim(sim) : !isByoSim(sim) && !isLteSim(sim));

    return matchesQuery && matchesNetwork && matchesStatus && matchesType;
  };

  const byoSims = sims.filter((s) => isByoSim(s));
  const filteredByoSims = byoSims.filter(applyFilters);
  const activeLteSims = sims.filter((s) => isLteSim(s) && String(s?.status || "") === "active");
  const filteredActiveLteSims = activeLteSims.filter(applyFilters);
  const filteredSims = sims.filter(applyFilters);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Manage SIM Cards</h2>
          <p className="text-sm text-slate-500 mt-1">Assign SIM cards to users and manage their network status.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">+ Assign SIM</Button>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <Label>Search</Label>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by email, phone, ICCID, network..."
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3 md:items-end">
            <div className="grid gap-2">
              <Label>Network</Label>
              <Select value={networkFilter} onValueChange={setNetworkFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="MTN">MTN</SelectItem>
                  <SelectItem value="Vodacom">Vodacom</SelectItem>
                  <SelectItem value="Telkom">Telkom</SelectItem>
                  <SelectItem value="lte">LTE / 5G</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="byo">Bring Your Own</SelectItem>
                  <SelectItem value="lte">LTE / 5G</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-end justify-between md:justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setNetworkFilter("all");
                setStatusFilter("all");
                setTypeFilter("all");
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-500 font-semibold">
          Showing {filteredSims.length} / {sims.length} SIMs
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">LTE / 5G SIM Cards</h3>
            <p className="text-xs text-slate-500 mt-1">View and manage active LTE / 5G SIM cards.</p>
          </div>
          <div className="text-xs text-slate-500 font-semibold">{filteredActiveLteSims.length} SIMs</div>
        </div>

        {filteredActiveLteSims.length === 0 ? (
          <div className="text-sm text-slate-500">No active LTE / 5G SIM cards found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>ICCID</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActiveLteSims.map((sim) => (
                  <TableRow key={sim.id}>
                    <TableCell className="font-medium">{sim.userEmail}</TableCell>
                    <TableCell>{sim.phoneNumber}</TableCell>
                    <TableCell className="text-xs text-mono">{sim.iccid}</TableCell>
                    <TableCell>{sim.network}</TableCell>
                    <TableCell>
                      <Badge variant={sim.status === "active" ? "default" : "secondary"}>{sim.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateSimStatus(sim.id, sim.status)}>
                          {sim.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Bring Your Own SIM (MTN)</h3>
            <p className="text-xs text-slate-500 mt-1">Client-added MTN SIM cards used for Data Bundle orders only.</p>
          </div>
          <div className="text-xs text-slate-500 font-semibold">{filteredByoSims.length} SIMs</div>
        </div>

        {filteredByoSims.length === 0 ? (
          <div className="text-sm text-slate-500">No client-added MTN SIM cards yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Bundle</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredByoSims.map((sim) => (
                  <TableRow key={sim.id}>
                    <TableCell className="font-medium">{sim.userEmail}</TableCell>
                    <TableCell>{sim.phoneNumber}</TableCell>
                    <TableCell>{sim.network}</TableCell>
                    <TableCell className="text-xs text-slate-700">{sim.activeBundle?.packageName || "-"}</TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {sim.activeBundle?.expiryDate ? format(new Date(sim.activeBundle.expiryDate), "yyyy-MM-dd") : "-"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {sim.activeBundle?.remainingAmountMB !== null && sim.activeBundle?.remainingAmountMB !== undefined
                        ? `${(Number(sim.activeBundle.remainingAmountMB) / 1024).toFixed(2)} GB`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sim.status === "active" ? "default" : "secondary"}>{sim.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openBalanceDialog(sim)}>
                          Update Balance
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => updateSimStatus(sim.id, sim.status)}>
                          {sim.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Phone Number</TableHead>
              <TableHead>ICCID</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Bundle</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSims.map(sim => (
              <TableRow key={sim.id}>
                <TableCell className="font-medium">{sim.userEmail}</TableCell>
                <TableCell>{sim.phoneNumber}</TableCell>
                <TableCell className="text-xs text-mono">{sim.iccid}</TableCell>
                <TableCell>{sim.network}</TableCell>
                <TableCell className="text-xs text-slate-700">{sim.activeBundle?.packageName || "-"}</TableCell>
                <TableCell className="text-xs text-slate-700">
                  {sim.activeBundle?.expiryDate ? format(new Date(sim.activeBundle.expiryDate), "yyyy-MM-dd") : "-"}
                </TableCell>
                <TableCell className="text-xs text-slate-700">
                  {sim.activeBundle?.remainingAmountMB !== null && sim.activeBundle?.remainingAmountMB !== undefined
                    ? `${(Number(sim.activeBundle.remainingAmountMB) / 1024).toFixed(2)} GB`
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={sim.status === 'active' ? 'default' : 'secondary'}>
                    {sim.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openBalanceDialog(sim)}>
                      Update Balance
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => updateSimStatus(sim.id, sim.status)}>
                      {sim.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isBalanceDialogOpen && (
        <Dialog
          open={isBalanceDialogOpen}
          onOpenChange={(open) => {
            setIsBalanceDialogOpen(open);
            if (!open) setBalanceSim(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Data Balance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid gap-2">
                <Label>Bundle / Package</Label>
                <Select value={balanceForm.packageId} onValueChange={(v) => setBalanceForm({ ...balanceForm, packageId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a bundle..." />
                  </SelectTrigger>
                  <SelectContent>
                    {packages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.amountMB >= 1024 ? `${(p.amountMB / 1024).toFixed(1)} GB` : `${p.amountMB} MB`})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={balanceForm.expiryDate}
                  onChange={(e) => setBalanceForm({ ...balanceForm, expiryDate: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label>Remaining (GB)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={balanceForm.remainingAmountGB}
                  onChange={(e) => setBalanceForm({ ...balanceForm, remainingAmountGB: e.target.value })}
                  min={0}
                  step="0.01"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsBalanceDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitBalanceUpdate}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isDialogOpen && (
         <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign SIM Card to User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid gap-2">
                <Label>Linked Client</Label>
                <Select value={formData.userId} onValueChange={v => setFormData({ ...formData, userId: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {selectedClient ? `${selectedClient.name || 'Unnamed Client'} (${selectedClient.email})` : "Select a client..."}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || 'Unnamed Client'} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Phone Number</Label>
                <Input value={formData.phoneNumber} onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label>ICCID / Serial Number</Label>
                <Input value={formData.iccid} onChange={e => setFormData({ ...formData, iccid: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label>Network Provider</Label>
                <Input value={formData.network} onChange={e => setFormData({ ...formData, network: e.target.value })} required />
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!formData.userId}>Assign SIM</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
