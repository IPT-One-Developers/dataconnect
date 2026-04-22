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

export default function AdminSims() {
  const [sims, setSims] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ userId: '', iccid: '', phoneNumber: '', network: 'MTN', status: 'active' });

  const loadData = async () => {
    try {
      setLoading(true);
      const [simsRes, usersRes] = await Promise.all([
        api<{ sims: any[] }>("/api/admin/sims"),
        api<{ users: any[] }>("/api/admin/users"),
      ]);
      setUsers(usersRes.users);
      setSims(simsRes.sims);
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

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Manage SIM Cards</h2>
          <p className="text-sm text-slate-500 mt-1">Assign SIM cards to users and manage their network status.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">+ Assign SIM</Button>
      </div>

      <div className="glass-card overflow-hidden">
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
            {sims.map(sim => (
              <TableRow key={sim.id}>
                <TableCell className="font-medium">{sim.userEmail}</TableCell>
                <TableCell>{sim.phoneNumber}</TableCell>
                <TableCell className="text-xs text-mono">{sim.iccid}</TableCell>
                <TableCell>{sim.network}</TableCell>
                <TableCell>
                  <Badge variant={sim.status === 'active' ? 'default' : 'secondary'}>
                    {sim.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" onClick={() => updateSimStatus(sim.id, sim.status)}>
                    {sim.status === 'active' ? 'Deactivate' : 'Activate'}
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
              <DialogTitle>Assign SIM Card to User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid gap-2">
                <Label>Linked Client</Label>
                <Select value={formData.userId} onValueChange={v => setFormData({ ...formData, userId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.role === 'client').map(u => (
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
