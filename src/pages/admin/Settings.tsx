import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    companyName: 'DataConnect',
    supportEmail: '',
    supportPhone: '',
    bankingDetails: '',
    logoUrl: ''
  });

  const loadSettings = async () => {
    try {
      const res = await api<{ settings: any }>("/api/company-settings");
      if (res.settings) {
        setSettings({
          companyName: res.settings.company_name ?? "DataConnect",
          supportEmail: res.settings.support_email ?? "",
          supportPhone: res.settings.support_phone ?? "",
          bankingDetails: res.settings.banking_details ?? "",
          logoUrl: res.settings.logo_url ?? "",
        });
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/admin/company-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      alert("Company Settings updated successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to update settings. Make sure you are an Admin.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading Settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Company Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage global app details, branding, and contact information.</p>
      </div>

      <div className="glass-card p-6 md:p-10">
         <form onSubmit={handleSave} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
               
               <div className="space-y-2">
                  <Label htmlFor="companyName" className="font-semibold text-slate-700">Company Name</Label>
                  <Input 
                    id="companyName" 
                    value={settings.companyName}
                    onChange={e => setSettings({...settings, companyName: e.target.value})}
                    placeholder="e.g. DataConnect Mobile"
                  />
                  <p className="text-[11px] text-slate-500">The primary brand name displayed across the portal.</p>
               </div>

               <div className="space-y-2">
                  <Label htmlFor="logoUrl" className="font-semibold text-slate-700">Logo URL</Label>
                  <Input 
                    id="logoUrl" 
                    type="url"
                    value={settings.logoUrl}
                    onChange={e => setSettings({...settings, logoUrl: e.target.value})}
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-[11px] text-slate-500">Public HTTP URL of your company logo.</p>
               </div>

               <div className="space-y-2">
                  <Label htmlFor="supportEmail" className="font-semibold text-slate-700">Support Email</Label>
                  <Input 
                    id="supportEmail" 
                    type="email"
                    value={settings.supportEmail}
                    onChange={e => setSettings({...settings, supportEmail: e.target.value})}
                    placeholder="support@example.com"
                  />
               </div>

               <div className="space-y-2">
                  <Label htmlFor="supportPhone" className="font-semibold text-slate-700">Support Phone / WhatsApp</Label>
                  <Input 
                    id="supportPhone" 
                    value={settings.supportPhone}
                    onChange={e => setSettings({...settings, supportPhone: e.target.value})}
                    placeholder="+27 82 000 0000"
                  />
               </div>
            </div>

            <hr className="border-slate-100 my-6" />
            
            <div className="space-y-2 max-w-2xl">
               <Label htmlFor="bankingDetails" className="font-semibold text-slate-700">EFT / Banking Details</Label>
               <textarea 
                 id="bankingDetails" 
                 rows={4}
                 value={settings.bankingDetails}
                 onChange={e => setSettings({...settings, bankingDetails: e.target.value})}
                 className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                 placeholder="Bank: Standard Bank&#10;Account Name: DataConnect PTY LTD&#10;Branch Code: 000000&#10;Account: 123456789"
               />
               <p className="text-[11px] text-slate-500">Clients will see these details when initiating a TopUp via EFT method.</p>
            </div>

            <div className="flex justify-end pt-4">
               <Button type="submit" size="lg" disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8">
                  {saving ? 'Saving...' : 'Save Configuration'}
               </Button>
            </div>
         </form>
      </div>

    </div>
  );
}
