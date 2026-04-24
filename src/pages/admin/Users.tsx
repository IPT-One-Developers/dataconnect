import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { MoreHorizontal, Edit, Trash2, Ban, CheckCircle, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', phone: '', role: 'client' as "admin" | "staff" | "client" });

  const navigate = useNavigate();

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await api<{ users: any[] }>("/api/admin/users");
      setUsers(res.users);
    } catch (e: any) {
      console.error("Failed to load users:", e);
      const code = String(e?.code || e?.message || "");
      if (code === "unauthorized") {
        alert("Your session has expired. Please log in again.");
        navigate("/login");
        return;
      }
      if (code === "account_suspended") {
        alert("Your account is suspended. Please contact support.");
        navigate("/login");
        return;
      }
      if (code === "forbidden") {
        alert("Admin access is required to view this page.");
        navigate("/login");
        return;
      }
      alert("Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const setRole = async (userId: string, nextRole: "admin" | "staff" | "client") => {
    try {
      if (confirm("Are you sure you want to change this user's access level?")) {
        await api(`/api/admin/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ role: nextRole }),
        });
        loadUsers();
        alert("Role updated. The user may need to log out and log in again to see the correct dashboard.");
      }
    } catch (e: any) {
      console.error(e);
      const code = String(e?.code || e?.message || "");
      if (code === "unauthorized") {
        alert("Your session has expired. Please log in again.");
        navigate("/login");
        return;
      }
      if (code === "account_suspended") {
        alert("Your account is suspended. Please contact support.");
        navigate("/login");
        return;
      }
      if (code === "forbidden") {
        alert("Admin access is required to update roles.");
        navigate("/login");
        return;
      }
      if (code === "db_unavailable") {
        alert("Database is unavailable. Please try again.");
        return;
      }
      alert("Failed to update role.");
    }
  };

  const handleSuspendClient = async (userId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
      if (confirm(`Are you sure you want to ${newStatus === 'suspended' ? 'suspend' : 'reactivate'} this client?`)) {
        await api(`/api/admin/users/${userId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
        });
        loadUsers();
      }
    } catch (e) {
       console.error(e);
       alert("Failed to update status.");
    }
  };

  const handleRemoveClient = async (userId: string) => {
     try {
        if (confirm("WARNING: Are you absolutely sure you want to permanently remove this client profile?")) {
           await api(`/api/admin/users/${userId}`, { method: "DELETE" });
           loadUsers();
        }
     } catch (e) {
        console.error(e);
        alert("Failed to remove client.");
     }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.email || !addForm.password) return;
    setAddLoading(true);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(addForm) });
      setIsAddOpen(false);
      setAddForm({ name: '', email: '', password: '', phone: '', role: 'client' });
      loadUsers();
      alert("User added successfully!");
    } catch (err: any) {
      console.error("Failed to add client", err);
      alert(`Error creating user: ${err.message}`);
    } finally {
      setAddLoading(false);
    }
  };

  const seedDemoData = async () => {
    try {
      const res = await api<{ ok: boolean; demoPassword?: string }>("/api/dev/seed-demo", { method: "POST" });
      await loadUsers();
      alert(res.demoPassword ? `Demo data added. Client password: ${res.demoPassword}` : "Demo data added.");
    } catch (e: any) {
      const code = String(e?.code || e?.message || "");
      if (code === "unauthorized") {
        alert("Your session has expired. Please log in again.");
        navigate("/login");
        return;
      }
      if (code === "account_suspended") {
        alert("Your account is suspended. Please contact support.");
        navigate("/login");
        return;
      }
      if (code === "forbidden") {
        alert("Admin access is required to seed demo data.");
        return;
      }
      if (code === "not_found") {
        alert("Demo seeding is not available in this environment.");
        return;
      }
      alert("Failed to seed demo data.");
    }
  };

  if (loading) return <div className="p-8">Loading users...</div>;

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(search.toLowerCase()) || 
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.phone?.includes(search)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">User Manager</h2>
          <p className="text-sm text-slate-500 mt-1">Platform user accounts, staff access, and roles.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={seedDemoData} className="font-bold rounded-lg">
            Seed Demo Data
          </Button>
          <Button onClick={() => setIsAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">
            + Add User
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-100">
           <Input 
             placeholder="Search by name, email, or phone number..." 
             value={search} 
             onChange={e => setSearch(e.target.value)}
             className="max-w-md w-full"
           />
        </div>
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Account Details</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status & Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
               <TableRow><TableCell colSpan={4} className="py-8 text-center text-slate-500">No users found.</TableCell></TableRow>
            ) : filteredUsers.map(u => (
              <TableRow key={u.id} className={u.status === 'suspended' ? 'bg-red-50/30 opacity-75' : ''}>
                <TableCell>
                  <div className="flex items-center gap-3">
                     {u.photoURL ? (
                       <img src={u.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" />
                     ) : (
                       <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400">{u.email.charAt(0).toUpperCase()}</div>
                     )}
                     <div>
                        <div className="font-medium text-gray-900">{u.name || 'No Name Added'}</div>
                        <div className="text-sm text-gray-500">{u.email}</div>
                     </div>
                  </div>
                </TableCell>
                <TableCell>{u.phone || '-'}</TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                     <Badge variant={u.role === 'admin' ? 'default' : u.role === 'staff' ? 'secondary' : 'outline'}>
                       {u.role === "admin" ? "admin" : u.role === "staff" ? "staff" : "client"}
                     </Badge>
                     {u.status === 'suspended' && (
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1">
                           <Ban className="w-3 h-3" /> Suspended
                        </span>
                     )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                   <DropdownMenu>
                     <DropdownMenuTrigger className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                       <span className="sr-only">Open menu</span>
                       <MoreHorizontal className="h-4 w-4" />
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">Actions</div>
                       <DropdownMenuItem onClick={() => navigate(`/admin/users/${u.id}`)}>
                         <Edit className="mr-2 h-4 w-4" /> Edit / View Details
                       </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRole(u.id, "admin")}>
                        <ShieldAlert className="mr-2 h-4 w-4" /> Set Role: Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRole(u.id, "staff")}>
                        <ShieldAlert className="mr-2 h-4 w-4" /> Set Role: Staff
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRole(u.id, "client")}>
                        <ShieldAlert className="mr-2 h-4 w-4" /> Set Role: Client
                      </DropdownMenuItem>
                       <DropdownMenuSeparator />
                       <DropdownMenuItem onClick={() => handleSuspendClient(u.id, u.status)}>
                         {u.status === 'suspended' ? <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" /> : <Ban className="mr-2 h-4 w-4 text-orange-600" />}
                         <span>{u.status === 'suspended' ? 'Reactivate User' : 'Suspend User'}</span>
                       </DropdownMenuItem>
                       <DropdownMenuItem onClick={() => handleRemoveClient(u.id)} className="text-red-600 focus:text-red-600">
                         <Trash2 className="mr-2 h-4 w-4" /> Remove Identity
                       </DropdownMenuItem>
                     </DropdownMenuContent>
                   </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isAddOpen && (
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
               <div>
                  <Label>Email *</Label>
                  <Input type="email" value={addForm.email} onChange={e => setAddForm({...addForm, email: e.target.value})} required />
               </div>
               <div>
                  <Label>Role *</Label>
                  <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v as any })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
               </div>
               <div>
                  <Label>Password * (Temp Login)</Label>
                  <Input type="text" value={addForm.password} onChange={e => setAddForm({...addForm, password: e.target.value})} required minLength={6} placeholder="Minimum 6 chars"/>
               </div>
               <div>
                  <Label>Full Name</Label>
                  <Input type="text" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
               </div>
               <div>
                  <Label>Phone Number</Label>
                  <Input type="text" value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})} />
               </div>
               <DialogFooter className="mt-4">
                 <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                 <Button type="submit" disabled={addLoading}>{addLoading ? 'Creating...' : 'Create User'}</Button>
               </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
