import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Users, CreditCard, TabletSmartphone as SimCardIcon } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalSims: 0,
    transactions: 0
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await api<{ stats: { totalUsers: number; totalSims: number; transactions: number } }>(
          "/api/admin/dashboard"
        );
        setStats(res.stats);
      } catch (e) {
        console.error(e);
      }
    }
    loadStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Admin Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Platform-wide statistics and metrics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-5">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Users</h3>
            <Users className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{stats.totalUsers}</div>
          </div>
        </div>
        
        <div className="glass-card p-5">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Registered SIMs</h3>
            <SimCardIcon className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{stats.totalSims}</div>
          </div>
        </div>

        <div className="glass-card p-5 border-t-4 border-t-emerald-500">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Transactions</h3>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{stats.transactions}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
