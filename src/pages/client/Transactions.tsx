import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Badge } from "../../../components/ui/badge";
import { format } from "date-fns";

export default function ClientTransactions() {
  const { user } = useAuthStore();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function loadTransactions() {
      try {
        setLoading(true);
        const res = await api<{ transactions: any[] }>("/api/client/transactions");
        setTransactions(res.transactions);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadTransactions();
  }, [user]);

  if (loading) return <div className="p-8">Loading history...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Recent Payments</h2>
        <p className="text-sm text-slate-500 mt-1">Review your past bundle purchases and account recharges.</p>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No transactions found.
                </TableCell>
              </TableRow>
            ) : (
              transactions.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="text-slate-500">
                    {format(new Date(tx.createdAt), 'PP p')}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">{tx.reference}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600">
                         {tx.paymentMethod.substring(0,3).toUpperCase()}
                       </div>
                       <span className="uppercase text-xs font-semibold">{tx.paymentMethod}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-black text-slate-900">
                    R {tx.amount.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={tx.status === 'success' ? 'default' : (tx.status === 'failed' ? 'destructive' : 'secondary')}>
                      {tx.status}
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
