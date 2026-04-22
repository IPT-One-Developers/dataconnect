import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Button } from "../../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import { format } from "date-fns";

export default function AdminClientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [client, setClient] = useState<any>(null);
  const [sims, setSims] = useState<any[]>([]);
  const [bundles, setBundles] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => {
    async function loadClientData() {
      if (!id) return;
      try {
        setLoading(true);
        const res = await api<{ client: any; sims: any[]; bundles: any[] }>(`/api/admin/users/${id}/details`);
        setClient(res.client);
        setEditName(res.client?.name || "");
        setEditPhone(res.client?.phone || "");
        setSims(res.sims || []);
        setBundles(res.bundles || []);
      } catch (e) {
        console.error(e);
        alert("Failed to load client details");
        navigate("/admin/users");
      } finally {
        setLoading(false);
      }
    }
    loadClientData();
  }, [id, navigate]);

  const handleUpdateClient = async () => {
    if (!id) return;
    setSaving(true);
    try {
       await api(`/api/admin/users/${id}`, {
         method: "PATCH",
         body: JSON.stringify({ name: editName, phone: editPhone }),
       });
       setClient({ ...client, name: editName, phone: editPhone });
       alert("Client updated successfully.");
    } catch (e) {
       console.error("Failed to update client", e);
       alert("Failed to update.");
    } finally {
       setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading client details...</div>;
  if (!client) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Client Profile View</h2>
          <p className="text-sm text-slate-500 mt-1">Manage personal data, SIMs, and bundles for this specific client.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Profile Card */}
        <div className="glass-card p-6 h-fit space-y-6">
           <div className="flex flex-col items-center justify-center text-center">
             {client.photoURL ? (
                <img src={client.photoURL} alt="Profile" className="w-24 h-24 rounded-full border-4 border-indigo-100 object-cover" />
             ) : (
                <div className="w-24 h-24 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center text-4xl font-bold uppercase mb-4 shadow-sm border-4 border-white">
                  {client.email.charAt(0)}
                </div>
             )}
             <h3 className="font-bold text-lg text-slate-900 mt-4">{client.name || 'Unnamed Client'}</h3>
             <Badge variant="secondary" className="mt-2">{client.role}</Badge>
           </div>
           
           <div className="space-y-4 pt-4 border-t border-slate-100">
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
               <Input value={client.email} disabled className="bg-slate-50" />
             </div>
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Full Name</label>
               <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="John Doe" />
             </div>
             <div className="space-y-1">
               <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</label>
               <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="(+27) ..." />
             </div>
             <Button onClick={handleUpdateClient} disabled={saving} className="w-full">
               {saving ? 'Saving...' : <><Save className="w-4 h-4 mr-2"/> Update Profile</>}
             </Button>
           </div>
        </div>

        {/* Dynamic Data (SIMs and Bundles) */}
        <div className="md:col-span-2 space-y-8">
           
           <h3 className="text-base font-bold text-slate-800">Allocated SIM Cards</h3>
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
                  <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-6">No SIMs allocated.</TableCell></TableRow>
                ) : sims.map(sim => (
                  <TableRow key={sim.id}>
                    <TableCell className="font-bold text-indigo-700">{sim.phoneNumber}</TableCell>
                    <TableCell className="font-mono text-xs">{sim.iccid}</TableCell>
                    <TableCell>{sim.network}</TableCell>
                    <TableCell>
                      <Badge variant={sim.status === 'active' ? 'default' : 'secondary'}>{sim.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
           </div>

           <h3 className="text-base font-bold text-slate-800 pt-4">Active Data Bundles</h3>
           <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Data Balance</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundles.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-slate-500 py-6">No bundles active.</TableCell></TableRow>
                ) : bundles.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.packageName || 'Unknown Package'}</TableCell>
                    <TableCell>
                       <div className="flex flex-col">
                         <span><b className="text-slate-900">{b.remainingAmountMB}</b> / {b.totalAmountMB} MB</span>
                         <div className="w-full bg-slate-100 h-1.5 mt-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{ width: `${Math.max(0, Math.min(100, (b.remainingAmountMB / b.totalAmountMB) * 100))}%` }} />
                         </div>
                       </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{format(new Date(b.expiryDate), 'PPP')}</TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'active' ? 'default' : 'secondary'}>{b.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
           </div>
        </div>

      </div>
    </div>
  );
}
