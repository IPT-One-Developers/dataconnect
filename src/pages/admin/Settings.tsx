import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

export default function AdminSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    companyName: 'DataConnect',
    supportEmail: '',
    supportPhone: '',
    bankingDetails: '',
    logoUrl: '',
    paymentProcessors: [] as string[],
    paymentProcessorSettings: {
      payfast: { merchantId: "", merchantKey: "", passphrase: "", sandbox: true },
      yoco: { publicKey: "", secretKey: "", sandbox: false },
      payat: { merchantId: "", apiKey: "", sandbox: false },
    } as any,
  });
  const paymentProcessorOptions = ["PayFast", "Yoco", "Pay@"] as const;

  const loadSettings = async () => {
    try {
      const res = await api<{ settings: any }>("/api/admin/company-settings");
      if (res.settings) {
        const processorsRaw = res.settings.payment_processors;
        const processors = Array.isArray(processorsRaw)
          ? processorsRaw.map((p: any) => String(p))
          : typeof processorsRaw === "string" && processorsRaw
            ? processorsRaw.split(",").map((p) => p.trim()).filter(Boolean)
            : [];
        const existingPps = res.settings.payment_processor_settings && typeof res.settings.payment_processor_settings === "object"
          ? res.settings.payment_processor_settings
          : {};

        setSettings({
          companyName: res.settings.company_name ?? "DataConnect",
          supportEmail: res.settings.support_email ?? "",
          supportPhone: res.settings.support_phone ?? "",
          bankingDetails: res.settings.banking_details ?? "",
          logoUrl: res.settings.logo_url ?? "",
          paymentProcessors: processors,
          paymentProcessorSettings: {
            payfast: {
              merchantId: String(existingPps?.payfast?.merchantId ?? ""),
              merchantKey: String(existingPps?.payfast?.merchantKey ?? ""),
              passphrase: String(existingPps?.payfast?.passphrase ?? ""),
              sandbox: Boolean(existingPps?.payfast?.sandbox ?? true),
            },
            yoco: {
              publicKey: String(existingPps?.yoco?.publicKey ?? ""),
              secretKey: String(existingPps?.yoco?.secretKey ?? ""),
              sandbox: Boolean(existingPps?.yoco?.sandbox ?? false),
            },
            payat: {
              merchantId: String(existingPps?.payat?.merchantId ?? ""),
              apiKey: String(existingPps?.payat?.apiKey ?? ""),
              sandbox: Boolean(existingPps?.payat?.sandbox ?? false),
            },
          },
        });
      }
    } catch (e: any) {
      console.error("Failed to load settings", e);
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
      if (code === "db_unavailable") {
        alert("Database is unavailable. Please try again.");
        return;
      }
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
        body: JSON.stringify({
          companyName: settings.companyName,
          supportEmail: settings.supportEmail,
          supportPhone: settings.supportPhone,
          bankingDetails: settings.bankingDetails,
          logoUrl: settings.logoUrl,
          paymentProcessors: settings.paymentProcessors,
          paymentProcessorSettings: settings.paymentProcessorSettings,
        }),
      });
      alert("Company Settings updated successfully.");
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
        alert("Admin access is required to update company settings.");
        return;
      }
      if (code === "db_unavailable") {
        alert("Database is unavailable. Please try again.");
        return;
      }
      alert("Failed to update settings.");
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

            <div className="space-y-2 max-w-2xl">
              <Label className="font-semibold text-slate-700">Payment Processors</Label>
              <div className="flex flex-wrap gap-2">
                {paymentProcessorOptions.map((p) => {
                  const selected = settings.paymentProcessors.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessors: selected
                            ? prev.paymentProcessors.filter((x) => x !== p)
                            : [...prev.paymentProcessors, p],
                        }));
                      }}
                      className={
                        selected
                          ? "inline-flex h-8 items-center rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white"
                          : "inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      }
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">Enable which payment processors are available for client checkout.</p>
            </div>

            {settings.paymentProcessors.includes("PayFast") && (
              <div className="space-y-4 max-w-2xl">
                <div className="text-sm font-bold text-slate-800">PayFast</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Merchant ID</Label>
                    <Input
                      value={settings.paymentProcessorSettings.payfast.merchantId}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            payfast: { ...prev.paymentProcessorSettings.payfast, merchantId: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Merchant Key</Label>
                    <Input
                      value={settings.paymentProcessorSettings.payfast.merchantKey}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            payfast: { ...prev.paymentProcessorSettings.payfast, merchantKey: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="font-semibold text-slate-700">Passphrase (optional)</Label>
                    <Input
                      value={settings.paymentProcessorSettings.payfast.passphrase}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            payfast: { ...prev.paymentProcessorSettings.payfast, passphrase: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.paymentProcessorSettings.payfast.sandbox)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        paymentProcessorSettings: {
                          ...prev.paymentProcessorSettings,
                          payfast: { ...prev.paymentProcessorSettings.payfast, sandbox: e.target.checked },
                        },
                      }))
                    }
                  />
                  Sandbox mode
                </label>
              </div>
            )}

            {settings.paymentProcessors.includes("Yoco") && (
              <div className="space-y-4 max-w-2xl">
                <div className="text-sm font-bold text-slate-800">Yoco</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Public Key</Label>
                    <Input
                      value={settings.paymentProcessorSettings.yoco.publicKey}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            yoco: { ...prev.paymentProcessorSettings.yoco, publicKey: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Secret Key</Label>
                    <Input
                      value={settings.paymentProcessorSettings.yoco.secretKey}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            yoco: { ...prev.paymentProcessorSettings.yoco, secretKey: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.paymentProcessorSettings.yoco.sandbox)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        paymentProcessorSettings: {
                          ...prev.paymentProcessorSettings,
                          yoco: { ...prev.paymentProcessorSettings.yoco, sandbox: e.target.checked },
                        },
                      }))
                    }
                  />
                  Sandbox mode
                </label>
              </div>
            )}

            {settings.paymentProcessors.includes("Pay@") && (
              <div className="space-y-4 max-w-2xl">
                <div className="text-sm font-bold text-slate-800">Pay@</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">Merchant ID</Label>
                    <Input
                      value={settings.paymentProcessorSettings.payat.merchantId}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            payat: { ...prev.paymentProcessorSettings.payat, merchantId: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-semibold text-slate-700">API Key</Label>
                    <Input
                      value={settings.paymentProcessorSettings.payat.apiKey}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          paymentProcessorSettings: {
                            ...prev.paymentProcessorSettings,
                            payat: { ...prev.paymentProcessorSettings.payat, apiKey: e.target.value },
                          },
                        }))
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.paymentProcessorSettings.payat.sandbox)}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        paymentProcessorSettings: {
                          ...prev.paymentProcessorSettings,
                          payat: { ...prev.paymentProcessorSettings.payat, sandbox: e.target.checked },
                        },
                      }))
                    }
                  />
                  Sandbox mode
                </label>
              </div>
            )}

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
