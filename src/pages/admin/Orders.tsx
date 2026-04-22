import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { format } from "date-fns";

export default function AdminOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await api<{ orders: any[] }>("/api/admin/orders?status=pending");
      setOrders(res.orders);
    } catch (e) {
      console.error(e);
      alert("Failed to load topup requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleFulfillOrder = async (order: any) => {
    if (!confirm(`Confirm that you have received payment referenced as ${order.reference} and wish to fulfill this Top-Up?`)) return;
    
    try {
      await api(`/api/admin/orders/${order.id}/fulfill`, { method: "POST", body: JSON.stringify({}) });
      alert("Top-Up successfully processed!");
      loadOrders();
    } catch (e) {
      console.error(e);
      alert("Failed to process top-up.");
      loadOrders(); // Refresh to ensure valid state
    }
  };

  const handleRejectOrder = async (orderId: string) => {
    if (!confirm("Are you sure you want to reject this order?")) return;
    
    try {
      await api(`/api/admin/orders/${orderId}/reject`, { method: "POST", body: JSON.stringify({}) });
      loadOrders();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <div className="p-8">Loading pending orders...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Top-Up Requests</h2>
        <p className="text-sm text-slate-500 mt-1">Process pending client data bundle orders.</p>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client Email</TableHead>
              <TableHead>Package</TableHead>
              <TableHead>Ref (SIM No.)</TableHead>
              <TableHead>Price</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    No pending orders at this time.
                 </TableCell>
               </TableRow>
            ) : orders.map(o => (
              <TableRow key={o.id}>
                <TableCell className="text-xs text-slate-500">{format(new Date(o.createdAt), 'PP p')}</TableCell>
                <TableCell className="font-medium">{o.userEmail}</TableCell>
                <TableCell>{o.packageName}</TableCell>
                <TableCell className="font-mono text-xs font-bold text-indigo-600">{o.reference}</TableCell>
                <TableCell className="font-bold">R {o.amount.toFixed(2)}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="outline" size="sm" onClick={() => handleRejectOrder(o.id)} className="text-red-500 hover:text-red-700">Reject</Button>
                  <Button size="sm" onClick={() => handleFulfillOrder(o)} className="bg-emerald-600 hover:bg-emerald-700">Fulfill Top-Up</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
