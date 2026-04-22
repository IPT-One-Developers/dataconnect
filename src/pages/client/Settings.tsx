import { useEffect, useState, useRef } from "react";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";
import { Bell, ShieldAlert, CheckCircle2, UserCircle, Camera, Upload, Trash2 } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";

export default function ClientSettings() {
  const { user, updatePhotoURL } = useAuthStore();
  const [preferences, setPreferences] = useState({
    expiryReminders: true,
    reminderDays: 3,
    lowBalanceAlerts: true,
    lowBalanceThresholdMB: 500,
    pushEnabled: false
  });
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [browserPermission, setBrowserPermission] = useState(Notification.permission);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        setLoading(true);
        const prefRes = await api<{ preferences: any }>("/api/client/preferences");
        if (prefRes.preferences) setPreferences(prefRes.preferences);
        setUserData({ email: user.email, photoURL: user.photoUrl ?? null });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notification");
      return;
    }
    
    if (Notification.permission === 'granted') {
       new Notification("DataConnect", { body: "Push notifications are already active!" });
       return;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);
      if (permission === "granted") {
        setPreferences({...preferences, pushEnabled: true});
        new Notification("DataConnect", { body: "Push notifications are now active!" });
      }
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api("/api/client/preferences", { method: "PUT", body: JSON.stringify(preferences) });
      alert("Preferences saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  const processImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        try {
           await api("/api/client/profile", { method: "PUT", body: JSON.stringify({ photoURL: compressedBase64 }) });
           setUserData({ ...userData, photoURL: compressedBase64 });
           updatePhotoURL(compressedBase64);
        } catch (err) {
           console.error("Failed to upload image", err);
           alert("Failed to save profile picture.");
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file);
    }
  };

  const removeProfilePicture = async () => {
     try {
       await api("/api/client/profile", { method: "PUT", body: JSON.stringify({ photoURL: null }) });
       setUserData({ ...userData, photoURL: null });
       updatePhotoURL(null);
     } catch (err) {
       console.error(err);
     }
  };

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Account Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your profile and notification preferences.</p>
      </div>

      <div className="glass-card p-6 space-y-8">
        
        {/* Profile Picture Section */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
            <UserCircle className="w-4 h-4 text-indigo-600" /> Profile Picture
          </h3>
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="relative">
              {userData?.photoURL ? (
                <img src={userData.photoURL} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-sm" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center border-4 border-white shadow-sm">
                  <span className="text-indigo-400 font-bold text-2xl uppercase">{user?.email?.substring(0,2)}</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-col gap-3 flex-1 w-full">
              <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageChange} />
              <input type="file" accept="image/*" capture="user" ref={cameraInputRef} className="hidden" onChange={handleImageChange} />
              
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" /> Upload Photo
                </Button>
                <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="w-4 h-4 mr-2" /> Take Photo
                </Button>
                {userData?.photoURL && (
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={removeProfilePicture}>
                    <Trash2 className="w-4 h-4 mr-2" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">Image will be resized and optimized automatically.</p>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-100" />
        
        {/* Browser Push Permission */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-indigo-600" /> Web Push Notifications
          </h3>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div>
              <p className="text-sm font-medium text-slate-900">Enable Browser Notifications</p>
              <p className="text-xs text-slate-500">Receive instant push alerts even when the dashboard is minimized.</p>
            </div>
            {browserPermission === 'granted' ? (
              <span className="flex items-center text-emerald-600 text-xs font-bold uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4 mr-1" /> Active
              </span>
            ) : (
              <Button size="sm" variant="outline" onClick={requestNotificationPermission}>Enable Push</Button>
            )}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Expiry Reminders */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
             Bundle Expiry Reminders
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox" 
                id="expiryReminders" 
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                checked={preferences.expiryReminders}
                onChange={e => setPreferences({...preferences, expiryReminders: e.target.checked})}
              />
              <Label htmlFor="expiryReminders" className="text-sm font-medium text-slate-700">Send reminder before expiry</Label>
            </div>
            
            {preferences.expiryReminders && (
              <div className="ml-7 flex items-center gap-3">
                <Label className="text-xs text-slate-500">Days before expiry:</Label>
                <select 
                  className="text-sm border-slate-300 rounded p-1"
                  value={preferences.reminderDays}
                  onChange={e => setPreferences({...preferences, reminderDays: Number(e.target.value)})}
                >
                  <option value={1}>1 Day</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Low Balance Alerts */}
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-indigo-600" /> Low Balance Alerts
          </h3>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input 
                type="checkbox" 
                id="lowBalanceAlerts" 
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                checked={preferences.lowBalanceAlerts}
                onChange={e => setPreferences({...preferences, lowBalanceAlerts: e.target.checked})}
              />
              <Label htmlFor="lowBalanceAlerts" className="text-sm font-medium text-slate-700">Alert me when data is low</Label>
            </div>

            {preferences.lowBalanceAlerts && (
              <div className="ml-7 flex items-center gap-3">
                <Label className="text-xs text-slate-500">Threshold (MB):</Label>
                <select 
                  className="text-sm border-slate-300 rounded p-1"
                  value={preferences.lowBalanceThresholdMB}
                  onChange={e => setPreferences({...preferences, lowBalanceThresholdMB: Number(e.target.value)})}
                >
                  <option value={100}>100 MB</option>
                  <option value={250}>250 MB</option>
                  <option value={500}>500 MB</option>
                  <option value={1024}>1 GB</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
           <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold w-full sm:w-auto">
             {saving ? 'Saving...' : 'Save Preferences'}
           </Button>
        </div>

      </div>
    </div>
  );
}
