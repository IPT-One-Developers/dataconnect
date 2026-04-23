import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authStore";

// Layouts
import MainLayout from "./layouts/MainLayout";
// Pages
import Login from "./pages/Login";
import ClientDashboard from "./pages/client/Dashboard";
import Packages from "./pages/client/Packages";
import ClientOrders from "./pages/client/Orders";
import ClientLteOrders from "./pages/client/LteOrders";
import ClientSims from "./pages/client/Sims";
import ClientTransactions from "./pages/client/Transactions";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminPackages from "./pages/admin/Packages";
import AdminLtePackages from "./pages/admin/LtePackages";
import AdminSims from "./pages/admin/Sims";
import AdminUsers from "./pages/admin/Users";
import AdminReports from "./pages/admin/Reports";
import AdminOrders from "./pages/admin/Orders";
import AdminClientDetails from "./pages/admin/ClientDetails";
import AdminSettings from "./pages/admin/Settings";
import ClientSettings from "./pages/client/Settings";

export default function App() {
  const { hydrate, loading, user, role } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to={role === "admin" ? "/admin" : "/client"} />} />
        
        {/* Protected Client Routes */}
        <Route path="/client" element={user && role === "client" ? <MainLayout /> : <Navigate to="/login" />}>
          <Route index element={<ClientDashboard />} />
          <Route path="orders" element={<ClientOrders />} />
          <Route path="lte-orders" element={<ClientLteOrders />} />
          <Route path="packages" element={<Packages />} />
          <Route path="sims" element={<ClientSims />} />
          <Route path="transactions" element={<ClientTransactions />} />
          <Route path="settings" element={<ClientSettings />} />
        </Route>

        {/* Protected Admin Routes */}
        <Route path="/admin" element={user && role === "admin" ? <MainLayout /> : <Navigate to="/login" />}>
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="packages" element={<AdminPackages />} />
          <Route path="lte-packages" element={<AdminLtePackages />} />
          <Route path="sims" element={<AdminSims />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="users/:id" element={<AdminClientDetails />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
