import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";

export default function AdminPackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", amountGB: "", price: "", durationDays: "", isActive: true });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<{ packages: any[] }>("/api/packages?activeOnly=false");
      setPackages(res.packages);
    } catch (e) {
      console.error(e);
      alert("Failed to load packages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateDialog = () => {
    setFormData({ name: "", description: "", amountGB: "", price: "", durationDays: "", isActive: true });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (pkg: any) => {
    setFormData({
      name: pkg.name,
      description: pkg.description,
      amountGB: (pkg.amountMB / 1024).toString(),
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
        amountMB: Number(formData.amountGB) * 1024,
        price: Number(formData.price),
        durationDays: Number(formData.durationDays),
        isActive: formData.isActive,
      };

      if (editingId) {
        await api(`/api/admin/packages/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/admin/packages", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert(editingId ? "Failed to update package" : "Failed to add package");
    }
  };

  const toggleStatus = async (pkgId: string, currentStatus: boolean) => {
    try {
      await api(`/api/admin/packages/${pkgId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const deletePackage = async (pkg: any) => {
    if (!pkg?.id) return;
    if (!confirm(`Delete package "${pkg.name}"?`)) return;
    try {
      await api(`/api/admin/packages/${pkg.id}`, { method: "DELETE", body: JSON.stringify({}) });
      loadData();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.code || e?.message || "");
      if (code === "in_use") {
        alert("This package cannot be deleted because it is referenced by existing orders.");
        return;
      }
      alert(`Failed to delete package${code ? ` (${code})` : ""}.`);
    }
  };

  const reorder = async (next: any[]) => {
    setPackages(next);
    try {
      await api("/api/admin/packages/reorder", {
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

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Manage Packages</h2>
          <p className="text-sm text-slate-500 mt-1">Create, configure and reorder data bundles available for purchase.</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">+ Create Package</Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Data (GB)</TableHead>
              <TableHead>Price (R)</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {packages.map(pkg => (
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
                <TableCell className="font-medium">
                  <span className="mr-2 inline-block select-none text-slate-400 cursor-grab">≡</span>
                  {pkg.name}
                </TableCell>
                <TableCell>{(pkg.amountMB / 1024).toFixed(1)}</TableCell>
                <TableCell>R{pkg.price.toFixed(2)}</TableCell>
                <TableCell>{pkg.durationDays} Days</TableCell>
                <TableCell>
                  <Badge variant={pkg.isActive ? 'default' : 'secondary'}>
                    {pkg.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(pkg)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleStatus(pkg.id, pkg.isActive)}>
                    Toggle Status
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deletePackage(pkg)}>
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isDialogOpen && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Package' : 'Add New Package'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Package Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Amount (GB)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amountGB}
                  onChange={(e) => setFormData({ ...formData, amountGB: e.target.value })}
                  required
                />
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
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit">{editingId ? 'Save Changes' : 'Create Package'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
