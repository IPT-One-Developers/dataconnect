import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";

export default function ClientSims() {
  const { user } = useAuthStore();
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadSims() {
      try {
        setLoading(true);
        const res = await api<{ sims: any[] }>("/api/client/sims");
        setSims(res.sims);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadSims();
  }, [user]);

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">My SIM Cards</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your active SIM cards and view their network status.</p>
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
    </div>
  );
}
