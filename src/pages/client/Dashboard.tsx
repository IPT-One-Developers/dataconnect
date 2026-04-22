import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Activity, Wifi, Package } from "lucide-react";

export default function ClientDashboard() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    activeSims: 0,
    activeBundles: 0,
    totalRemainingMB: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    async function loadData() {
      try {
        setLoading(true);
        const res = await api<{ stats: { activeSims: number; activeBundles: number; totalRemainingMB: number } }>(
          "/api/client/dashboard"
        );
        setStats(res.stats);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [user]);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Live Data Bundle Status</h1>
        <p className="text-sm text-slate-500 mt-1">Here is the overview of your account.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-5">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active SIM Cards</h3>
            <Wifi className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{stats.activeSims}</div>
          </div>
        </div>
        
        <div className="glass-card p-5">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Bundles</h3>
            <Package className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">{stats.activeBundles}</div>
          </div>
        </div>

        <div className="glass-card p-5 border-t-4 border-t-indigo-500">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Data Balance</h3>
            <Activity className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <div className="text-3xl font-black text-slate-900">
              {(stats.totalRemainingMB / 1024).toFixed(2)} GB
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Across all SIMs</p>
          </div>
        </div>
      </div>
      
      {/* Recent Bundles or Warnings can go here */}
      <section>
        <h2 className="text-lg font-bold text-slate-800 mb-4">Updates & Alerts</h2>
        <div className="glass-card p-5">
           <p className="text-sm font-medium text-slate-600">No new alerts right now. You're doing great!</p>
        </div>
      </section>
    </div>
  );
}
