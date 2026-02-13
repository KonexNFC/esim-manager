import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { Navbar } from "@/components/navbar";
import Home from "@/pages/home";
import Destinations from "@/pages/destinations";
import DestinationDetail from "@/pages/destination-detail";
import Checkout from "@/pages/checkout";
import Orders from "@/pages/orders";
import OrderDetail from "@/pages/order-detail";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/destinations" component={Destinations} />
      <Route path="/destinations/:id" component={DestinationDetail} />
      <Route path="/checkout/:planId" component={Checkout} />
      <Route path="/orders" component={Orders} />
      <Route path="/orders/:id" component={OrderDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background text-foreground">
            <Navbar />
            <Router />
          </div>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
