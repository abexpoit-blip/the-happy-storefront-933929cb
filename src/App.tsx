import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute, AdminRoute } from "@/components/AppShell";
import ScrollToTop from "@/components/ScrollToTop";
import TopProgress from "@/components/TopProgress";

import { LanguageProvider } from "@/lib/i18n";

// Eager: first screens users hit.
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Shop from "./pages/Shop";

// Lazy: everything else — keeps the initial bundle small and first paint fast.
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminSettings = lazy(() => import("./pages/AdminSettings"));
const AdminSiteSettings = lazy(() => import("./pages/AdminSiteSettings"));
const Cart = lazy(() => import("./pages/Cart"));
const Orders = lazy(() => import("./pages/Orders"));
const Recharge = lazy(() => import("./pages/Recharge"));
const Referrals = lazy(() => import("./pages/Referrals"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminCards = lazy(() => import("./pages/AdminCards"));
const AdminPaymentGateway = lazy(() => import("./pages/AdminPaymentGateway"));
const AdminPayments = lazy(() => import("./pages/AdminPayments"));
const AdminCategories = lazy(() => import("./pages/AdminCategories"));
const AdminShop = lazy(() => import("./pages/AdminShop"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-[13px] text-[#888]">Загрузка…</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner theme="light" />
      <BrowserRouter>
        <LanguageProvider>
        <AuthProvider>
          <ScrollToTop />
          <TopProgress />

          <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public auth pages */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/crzr-x9k2-panel" element={<AdminLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin/reset-password" element={<ResetPassword />} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/settings" element={<AdminRoute><AdminSettings /></AdminRoute>} />
            <Route path="/admin/site" element={<AdminRoute><AdminSiteSettings /></AdminRoute>} />

            <Route path="/admin/cards" element={<AdminRoute><AdminCards /></AdminRoute>} />

            <Route path="/admin/payments" element={<AdminRoute><AdminPayments /></AdminRoute>} />
            <Route path="/admin/payment-gateway" element={<AdminRoute><AdminPaymentGateway /></AdminRoute>} />

            <Route path="/admin/categories" element={<AdminRoute><AdminCategories /></AdminRoute>} />
            <Route path="/admin/shop" element={<AdminRoute><AdminShop /></AdminRoute>} />

            {/* Buyer routes — Scorpion-style: only 5 nav pages */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/shop" element={<ProtectedRoute><Shop /></ProtectedRoute>} />
            <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/recharge" element={<ProtectedRoute><Recharge /></ProtectedRoute>} />
            <Route path="/referrals" element={<ProtectedRoute><Referrals /></ProtectedRoute>} />


            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
