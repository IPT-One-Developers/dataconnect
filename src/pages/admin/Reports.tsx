import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { format } from "date-fns";

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [packageStats, setPackageStats] = useState<any[]>([]);
  const [dateRangeFilter, setDateRangeFilter] = useState(30);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    async function fetchReports() {
      setLoading(true);
      try {
        const res = await api<{ totalRevenue: number; revenueData: any[]; packageStats: any[] }>(
          `/api/admin/reports?days=${dateRangeFilter}`
        );
        setRevenueData(
          (res.revenueData || []).map((d: any) => ({
            date: format(new Date(d.date), "MMM dd"),
            revenue: d.revenue,
          }))
        );
        setPackageStats(res.packageStats || []);
        setTotalRevenue(res.totalRevenue || 0);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchReports();
  }, [dateRangeFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Sales Reports</h2>
          <p className="text-sm text-slate-500 mt-1">Transaction analytics and package performance.</p>
        </div>
        <select 
          className="border border-slate-300 bg-white text-slate-700 text-sm rounded-lg p-2.5 outline-none focus:border-indigo-500"
          value={dateRangeFilter}
          onChange={(e) => setDateRangeFilter(Number(e.target.value))}
        >
          <option value={7}>Last 7 Days</option>
          <option value={30}>Last 30 Days</option>
          <option value={90}>Last 90 Days</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-5 border-t-4 border-t-emerald-500 md:col-span-1">
          <div className="flex flex-row items-center justify-between pb-4 border-b border-white/40 mb-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Total Revenue generated</h3>
          </div>
          <div>
            <div className="text-4xl font-black text-slate-900">R {totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-emerald-600 mt-2 font-bold uppercase tracking-widest">In Date Range</p>
          </div>
        </div>
        
        <div className="glass-card p-5 md:col-span-2 relative min-h-[300px]">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Revenue over Time</h3>
          {loading ? (
             <div className="absolute inset-0 flex items-center justify-center text-slate-400">Loading chart...</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(v) => `R${v}`} />
                <Tooltip 
                  formatter={(value: number) => [`R${value.toFixed(2)}`, 'Revenue']}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="#e0e7ff" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Popular Data Packages Sold</h3>
        {loading ? (
           <div className="py-12 text-center text-slate-400">Loading data...</div>
        ) : (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={packageStats} layout="vertical" margin={{top: 5, right: 30, left: 20, bottom: 5}}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                <YAxis dataKey="name" type="category" width={150} axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b', fontWeight: 'bold'}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Legend />
                <Bar dataKey="count" name="Purchases" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                <Bar dataKey="revenue" name="Revenue (R)" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
