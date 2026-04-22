import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";

export default function Packages() {
  const { user } = useAuthStore();
  const [packages, setPackages] = useState<any[]>([]);
  const [sims, setSims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPkg, setSelectedPkg] = useState<any>(null);
  const [selectedSimId, setSelectedSimId] = useState<string>('');
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      try {
        setLoading(true);
        const [pkgRes, simRes] = await Promise.all([
          api<{ packages: any[] }>("/api/packages?activeOnly=true"),
          api<{ sims: any[] }>("/api/client/sims"),
        ]);
        setPackages(pkgRes.packages);
        setSims(simRes.sims);
      } catch (e) {
        console.error(e);
        alert("Failed to load packages");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const handlePurchase = async () => {
    if (!selectedSimId) {
      alert("Please select a SIM card to top-up.");
      return;
    }
    
    setOrdering(true);
    try {
      await api("/api/client/orders", {
        method: "POST",
        body: JSON.stringify({ packageId: selectedPkg.id, simId: selectedSimId }),
      });
      
      alert('Your top-up order has been successfully submitted to the admin for processing.');
      setSelectedPkg(null);
      setSelectedSimId('');
    } catch (e) {
      console.error(e);
      alert('Failed to place order.');
    } finally {
      setOrdering(false);
    }
  };

  if (loading) return <div className="p-8">Loading packages...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Popular Data Packages</h2>
        <p className="text-sm text-slate-500 mt-1">Select a data package to recharge your account.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {packages.map((pkg, i) => {
          // Rotate border colors like the design
          const borders = ['border-t-indigo-500', 'border-t-purple-500', 'border-t-slate-800', 'border-t-emerald-500'];
          const borderClass = borders[i % borders.length];

          return (
          <div key={pkg.id} className={`glass-card p-5 text-center border-t-4 flex flex-col ${borderClass}`}>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{pkg.name}</p>
            <h3 className="text-2xl font-black my-2">
              {pkg.amountMB >= 1024 ? `${(pkg.amountMB / 1024).toFixed(1)} GB` : `${pkg.amountMB} MB`}
              <span className="text-sm font-normal ml-1 text-slate-500">{pkg.durationDays} Days</span>
            </h3>
            <p className="text-lg font-bold text-slate-800 mb-2">R {pkg.price.toFixed(2)}</p>
            <p className="text-[10px] text-slate-400 mb-4 h-8">{pkg.description}</p>
            <button 
              className="w-full mt-auto py-2 border border-slate-200 text-slate-800 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold rounded-lg transition-colors"
              onClick={() => setSelectedPkg(pkg)}
            >
              Buy Package
            </button>
          </div>
        )})}
      </div>

      {selectedPkg && (
        <Dialog open={!!selectedPkg} onOpenChange={() => setSelectedPkg(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order Data Bundle Top-Up</DialogTitle>
              <DialogDescription>
                You are about to submit an order for <strong>{selectedPkg.name}</strong> at R{selectedPkg.price.toFixed(2)}. This request will be sent to the administrator to process the top-up.
              </DialogDescription>
            </DialogHeader>
            <div className="px-1 py-4 space-y-4">
               <div>
                  <Label>Payment Reference</Label>
                  <p className="text-sm text-slate-500 mt-1">Please select the SIM card you want to top-up. <b>Its Phone Number will act as your Payment Reference.</b></p>
               </div>
               <Select value={selectedSimId} onValueChange={setSelectedSimId}>
                  <SelectTrigger>
                     <SelectValue placeholder="Select target SIM card..." />
                  </SelectTrigger>
                  <SelectContent>
                     {sims.length === 0 && <SelectItem value="disabled" disabled>No active SIM cards found</SelectItem>}
                     {sims.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                           {s.phoneNumber} - {s.network}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedPkg(null)}>Cancel</Button>
              <Button onClick={handlePurchase} disabled={ordering || !selectedSimId}>
                {ordering ? 'Placing Order...' : 'Submit Top-Up Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
