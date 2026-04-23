import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";

export default function AdminLtePackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    dataCapGB: "",
    speedMbps: "",
    price: "",
    durationDays: "",
    isActive: true,
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<{ packages: any[] }>("/api/lte-packages?activeOnly=false");
      const next = Array.isArray((res as any)?.packages) ? (res as any).packages : [];
      setPackages(next);
    } catch (e) {
      console.error(e);
      const code = (e as any)?.code ? String((e as any).code) : "";
      const message = (e as any)?.message ? String((e as any).message) : "";
      let extra = code || message ? ` (${code || message})` : "";
      try {
        const health = await api<any>("/api/health");
        const missing = Array.isArray(health?.schema?.missing) ? health.schema.missing : [];
        if (missing.length > 0) extra += ` [schema missing: ${missing.join(", ")}]`;
      } catch {
      }
      alert(`Failed to load LTE / 5G packages${extra}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateDialog = () => {
    setFormData({ name: "", description: "", dataCapGB: "", speedMbps: "", price: "", durationDays: "", isActive: true });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (pkg: any) => {
    setFormData({
      name: pkg.name,
      description: pkg.description,
      dataCapGB: pkg.dataCapGB === null ? "" : String(pkg.dataCapGB),
      speedMbps: pkg.speedMbps === null ? "" : String(pkg.speedMbps),
      price: pkg.price.toString(),
      durationDays: pkg.durationDays.toString(),
      isActive: pkg.isActive,
    });
    setEditingId(pkg.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        dataCapGB: formData.dataCapGB === "" ? null : Number(formData.dataCapGB),
        speedMbps: formData.speedMbps === "" ? null : Number(formData.speedMbps),
        price: Number(formData.price),
        durationDays: Number(formData.durationDays),
        isActive: formData.isActive,
      };

      if (editingId) {
        await api(`/api/admin/lte-packages/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/admin/lte-packages", { method: "POST", body: JSON.stringify(payload) });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      const code = (err as any)?.code ? String((err as any).code) : "";
      const message = (err as any)?.message ? String((err as any).message) : "";
      const extra = code || message ? ` (${code || message})` : "";
      alert(`${editingId ? "Failed to update package" : "Failed to add package"}${extra}`);
    }
  };

  const toggleStatus = async (pkgId: string, currentStatus: boolean) => {
    try {
      await api(`/api/admin/lte-packages/${pkgId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const reorder = async (next: any[]) => {
    setPackages(next);
    try {
      await api("/api/admin/lte-packages/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
    } catch (e) {
      console.error(e);
      loadData();
    }
  };

  const handleDropOn = async (targetId: string, draggedId: string | null) => {
    if (!draggedId || draggedId === targetId) return;
    const current = [...packages];
    const fromIndex = current.findIndex((p) => p.id === draggedId);
    const toIndex = current.findIndex((p) => p.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const moved = current.splice(fromIndex, 1)[0];
    current.splice(toIndex, 0, moved);
    setDraggingId(null);
    await reorder(current);
  };

  if (loading) return <div className="p-8">Loading packages...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">LTE / 5G Packages</h2>
          <p className="text-sm text-slate-500 mt-1">Create, configure and reorder LTE / 5G packages available for purchase.</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">
          + Create Package
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Cap</TableHead>
              <TableHead>Speed</TableHead>
              <TableHead>Price (R)</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-slate-500 text-sm">
                  No LTE / 5G packages yet.
                </TableCell>
              </TableRow>
            ) : (
              packages.map((pkg) => (
                <TableRow
                  key={pkg.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingId(pkg.id);
                    e.dataTransfer.setData("text/plain", pkg.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragged = e.dataTransfer.getData("text/plain") || draggingId;
                    handleDropOn(pkg.id, dragged);
                  }}
                  className={draggingId === pkg.id ? "opacity-60" : ""}
                >
                  <TableCell className="text-slate-400 select-none cursor-grab">≡</TableCell>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell className="text-xs text-slate-600 max-w-[340px] truncate">{pkg.description || "-"}</TableCell>
                  <TableCell>{pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`}</TableCell>
                  <TableCell>{pkg.speedMbps === null ? "-" : `${pkg.speedMbps} Mbps`}</TableCell>
                  <TableCell>R{Number(pkg.price).toFixed(2)}</TableCell>
                  <TableCell>{Number(pkg.durationDays)} Days</TableCell>
                  <TableCell>
                    <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(pkg)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleStatus(pkg.id, pkg.isActive)}>
                      Toggle Status
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {isDialogOpen && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Package" : "Add New Package"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Package Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Cap (GB)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.dataCapGB}
                    onChange={(e) => setFormData({ ...formData, dataCapGB: e.target.value })}
                    placeholder="Leave blank for uncapped"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Speed (Mbps)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.speedMbps}
                    onChange={(e) => setFormData({ ...formData, speedMbps: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Duration (Days)</Label>
                <Input
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                  required
                />
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingId ? "Save Changes" : "Create Package"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
