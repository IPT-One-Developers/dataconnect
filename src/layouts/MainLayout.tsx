import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  LayoutDashboard,
  Package,
  TabletSmartphone as SimCardIcon,
  History,
  Users,
  LogOut,
  SignalHigh,
  BarChart3,
  Bell
} from "lucide-react";
import { Button } from "../../components/ui/button";

export default function MainLayout() {
  const { role, user, photoURL, logout } = useAuthStore();
  const location = useLocation();

  const clientLinks = [
    { name: 'Overview', href: '/client', icon: LayoutDashboard },
    { name: 'My SIMs', href: '/client/sims', icon: SimCardIcon },
    { name: 'Orders', href: '/client/orders', icon: SignalHigh },
    { name: 'Transactions', href: '/client/transactions', icon: History },
    { name: 'Settings', href: '/client/settings', icon: Bell },
  ];

  const adminLinks = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'TopUp Orders', href: '/admin/orders', icon: History },
    { name: 'Manage Packages', href: '/admin/packages', icon: Package },
    { name: 'Manage SIM IDs', href: '/admin/sims', icon: SimCardIcon },
    { name: 'Client Manager', href: '/admin/users', icon: Users },
    { name: 'Sales Reports', href: '/admin/reports', icon: BarChart3 },
    { name: 'Company Settings', href: '/admin/settings', icon: Bell },
  ];

  const links = role === "admin" ? adminLinks : clientLinks;

  const handleSignOut = async () => {
    await logout();
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-60 bg-slate-900 text-white flex flex-col shrink-0 border-r border-slate-800">
        <div className="h-20 flex items-center px-6">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white mr-3">M</div>
          <span className="text-xl font-bold tracking-tight">DataConnect</span>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-2">
          {links.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <item.icon className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 mt-auto">
          <div className="p-4 bg-slate-800/50 rounded-xl mb-4 flex items-center gap-3">
             {photoURL ? (
                <img src={photoURL} className="w-10 h-10 rounded-full border-2 border-indigo-500 object-cover shrink-0" alt="Avatar" />
             ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center shrink-0 uppercase">
                  {user?.email?.charAt(0)}
                </div>
             )}
            <div className="overflow-hidden">
              <div className="text-xs text-slate-400 mb-1 uppercase tracking-widest">{role === "admin" ? "Admin Mode" : "Client Mode"}</div>
              <div className="text-sm font-semibold truncate text-white">{user?.email}</div>
            </div>
          </div>
          <Button variant="outline" className="w-full justify-start text-white border-slate-700 bg-slate-800 hover:bg-slate-700 hover:text-white" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-20 flex items-center justify-between px-8 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-xs text-slate-500 uppercase font-bold tracking-tighter">Status</span>
              <span className="text-sm font-black text-slate-900 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                System Active
              </span>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
