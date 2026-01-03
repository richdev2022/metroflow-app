import { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { CheckCircle2, AlertTriangle, CreditCard, Shield, Users, History, Loader2, Trash2, Star, Plus, Eye, Search, CalendarIcon, Download } from "lucide-react";

import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { Subscription as SubscriptionType, Plan, PaymentTransaction, Card as CardType } from "@shared/api";

export default function Subscription() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionType | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [cards, setCards] = useState<CardType[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<PaymentTransaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState(1);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [perPage] = useState(5);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlanForCheckout, setSelectedPlanForCheckout] = useState<Plan | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    fetch('https://api.exchangerate-api.com/v4/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data.rates && data.rates.NGN) {
          setExchangeRate(data.rates.NGN);
        }
      })
      .catch(err => console.error("Failed to fetch rates", err));
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on search change
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [status, date]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const queryParams = new URLSearchParams({
        ...(date?.from && { startDate: format(date.from, 'yyyy-MM-dd') }),
        ...(date?.to && { endDate: format(date.to, 'yyyy-MM-dd') })
      });

      const response = await api.get(`/subscription/transactions/export?${queryParams}`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast({
        title: "Export Successful",
        description: "Your transactions have been exported to CSV."
      });
    } catch (error) {
      console.error("Failed to export transactions", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to export transactions"
      });
    } finally {
      setExporting(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setTransactionsLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        perPage: perPage.toString(),
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(status !== 'all' && { status }),
        ...(date?.from && { startDate: date.from.toISOString() }),
        ...(date?.to && { endDate: date.to.toISOString() })
      });

      const response = await api.get(`/subscription/transactions?${queryParams}`);
      if (response.data.success) {
        setTransactions(response.data.transactions || []);
        // Assuming backend returns pagination info. If not, we default to 1 page or infer from data length
        // Adjust this based on actual API response structure if known
        setTotalPages(response.data.pagination?.totalPages || response.data.meta?.last_page || (response.data.transactions?.length < perPage ? page : page + 1));
      }
    } catch (error: any) {
      const message = error.message || "Failed to load transactions";
      // Only log unexpected errors
      if (!message.includes("Unable to connect")) {
         console.error("Failed to fetch transactions", error);
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: message
      });
    } finally {
      setTransactionsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, debouncedSearch, status, date]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [plansRes, subRes, cardsRes] = await Promise.all([
        api.get("/subscription/plans"),
        api.get("/subscription/current"),
        api.get("/subscription/cards")
      ]);

      if (plansRes.data.success) setPlans(plansRes.data.plans);
      if (subRes.data.success) setSubscription(subRes.data.subscription);
      if (cardsRes.data.success) setCards(cardsRes.data.cards || []);

    } catch (error) {
      console.error("Failed to fetch data", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load subscription details"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleCancel = async () => {
    try {
      setProcessingId('cancel');

      await api.post("/subscription/cancel", {});
      
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled successfully."
      });
      fetchInitialData();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to cancel subscription"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDowngrade = async () => {
      try {
        setProcessingId('downgrade');
  
        await api.post("/subscription/downgrade", {});
        
        toast({
          title: "Plan Downgraded",
          description: "You are now on the Free Trial plan."
        });
        fetchInitialData();
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.response?.data?.error || "Failed to downgrade plan"
        });
      } finally {
        setProcessingId(null);
      }
    };

  const handleUpgrade = (plan: Plan) => {
    setSelectedPlanForCheckout(plan);
  };

  const confirmUpgrade = async () => {
    if (!selectedPlanForCheckout) return;
    const planId = selectedPlanForCheckout.id;

    try {
      setProcessingId(planId);

      // Initiate payment via Squad
      const response = await api.post("/subscription/initiate-payment", 
        { 
          planId,
          currency: currency // Pass selected currency
        }
      );

      if (response.data.success && response.data.checkout_url) {
        toast({
          title: "Redirecting",
          description: "Redirecting to payment gateway..."
        });
        // Redirect to Squad checkout
        window.location.href = response.data.checkout_url;
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error: any) {
      console.error("Upgrade error", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.error || "Failed to initiate payment"
      });
      setProcessingId(null); // Only stop loading if failed, otherwise we redirect
    }
  };

  const handleAddCard = async () => {
    try {
      setProcessingId('add-card');
      const response = await api.post("/subscription/cards/initiate", {});
      
      if (response.data.success && response.data.checkout_url) {
         toast({
          title: "Redirecting",
          description: "Redirecting to payment gateway to verify card..."
        });
        window.location.href = response.data.checkout_url;
      }
    } catch (error: any) {
       toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.error || "Failed to initiate card addition"
      });
      setProcessingId(null);
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    try {
      setProcessingId(`remove-${cardId}`);
      await api.delete(`/subscription/cards/${cardId}`);
      toast({ title: "Card removed", description: "Card has been successfully removed." });
      
      // Update local state
      setCards(cards.filter(c => c.id !== cardId));
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.error || "Failed to remove card"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleSetActiveCard = async (cardId: string) => {
    try {
       setProcessingId(`active-${cardId}`);
       await api.put(`/subscription/cards/${cardId}/active`, {});
       toast({ title: "Card updated", description: "Card set as active for subscriptions." });
       
       // Update local state
       setCards(cards.map(c => ({
         ...c,
         is_active: c.id === cardId
       })));
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.response?.data?.error || "Failed to update card"
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p>Loading subscription details...</p>
        </div>
      </Layout>
    );
  }

  const isTrial = subscription?.trial_ends_at && new Date(subscription.trial_ends_at) > new Date();
  const daysLeft = subscription?.trial_ends_at 
    ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) 
    : 0;

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Subscription & Billing</h1>
            <p className="text-muted-foreground">Manage your plan and billing details.</p>
          </div>
          {subscription && subscription.plan_price != "0" && subscription.plan_price != "0.00" && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDowngrade} disabled={!!processingId}>
                {processingId === 'downgrade' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Downgrade to Free
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={!!processingId}>
                {processingId === 'cancel' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Cancel Subscription
              </Button>
            </div>
          )}
        </div>

        {subscription && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Current Plan: {subscription.plan_name}</CardTitle>
                  <CardDescription>
                    Status: <Badge variant={subscription.subscription_status === 'active' ? 'default' : 'destructive'} className="ml-2 capitalize">
                      {subscription.subscription_status}
                    </Badge>
                  </CardDescription>
                </div>
                {isTrial && (
                  <Badge variant="secondary" className="text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200">
                    Trial ends in {daysLeft} days
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Team Members</div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{subscription.team_usage} used</span>
                    <span>{subscription.max_team_members > 9999 ? 'Unlimited' : subscription.max_team_members} limit</span>
                  </div>
                  <Progress 
                    value={(subscription.team_usage / (subscription.max_team_members > 9999 ? 100 : subscription.max_team_members)) * 100} 
                    className="h-2"
                  />
                </div>
                <div className="space-y-1">
                  {isTrial ? (
                    <>
                      <div className="text-sm font-medium">Trial Period</div>
                      <div className="text-sm text-muted-foreground">
                        Ends on {subscription.trial_ends_at && format(new Date(subscription.trial_ends_at), 'PPP')}
                      </div>
                    </>
                  ) : subscription.next_due_subscription_date ? (
                    <>
                       <div className="text-sm font-medium">Next Billing Date</div>
                       <div className="text-sm text-muted-foreground">
                         {format(new Date(subscription.next_due_subscription_date), 'PPP')}
                       </div>
                    </>
                  ) : null}
                </div>
              </div>
              
              {subscription.subscription_status === 'inactive' && (
                <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertTriangle className="h-5 w-5" />
                  <span>Your subscription is inactive. Please upgrade to continue using all features.</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment Methods Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-6 w-6" />
              <h2 className="text-2xl font-bold tracking-tight">Payment Methods</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline-block">
                A verification fee of ₦100 will be charged
              </span>
              <Button onClick={handleAddCard} disabled={!!processingId}>
                {processingId === 'add-card' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add Card
              </Button>
            </div>
          </div>
          
          <div className="grid gap-4 md:grid-cols-3">
            {cards.map((card) => (
              <Card key={card.id} className={card.is_active ? "border-primary" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium capitalize">
                    <CreditCard className="h-4 w-4" />
                    {card.card_type} **** {card.last4}
                  </CardTitle>
                  {card.is_active && <Badge variant="secondary">Active</Badge>}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">Expires {card.exp_month}/{card.exp_year}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.is_active ? "Used for recurring billing" : "Backup payment method"}
                  </p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  {!card.is_active && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleSetActiveCard(card.id)}
                      disabled={!!processingId}
                    >
                      {processingId === `active-${card.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set Active"}
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleRemoveCard(card.id)}
                    disabled={!!processingId}
                  >
                     {processingId === `remove-${card.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </CardFooter>
              </Card>
            ))}
            {cards.length === 0 && (
               <div className="col-span-3 text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                 No cards added yet. Add a card to enable recurring billing.
               </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold tracking-tight">Available Plans</h2>
            
            <div className="flex items-center gap-6">
              <Tabs defaultValue="monthly" value={billingCycle} onValueChange={(v) => setBillingCycle(v as "monthly" | "yearly")}>
                <TabsList>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="yearly">Yearly</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex items-center space-x-2">
                <Label htmlFor="currency-mode" className={currency === 'USD' ? 'font-bold' : 'text-muted-foreground'}>USD</Label>
                <Switch 
                  id="currency-mode" 
                  checked={currency === 'NGN'}
                  onCheckedChange={(checked) => setCurrency(checked ? 'NGN' : 'USD')}
                />
                <Label htmlFor="currency-mode" className={currency === 'NGN' ? 'font-bold' : 'text-muted-foreground'}>NGN</Label>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans
              .filter(p => !p.duration || p.duration === billingCycle)
              .map((plan) => {
              const isCurrentPlan = subscription?.plan_id === plan.id;
              
              const originalPrice = currency === 'USD' ? plan.price : Math.round(plan.price * exchangeRate);
              const discountVal = parseFloat(plan.discount || "0");
              const discount = currency === 'USD' ? discountVal : Math.round(discountVal * exchangeRate);
              const finalPrice = Math.max(0, originalPrice - discount);
              
              const symbol = currency === 'USD' ? '$' : '₦';
              
              // Find the current plan's price from the plans array to ensure currency consistency (USD)
              const currentSubscriptionPlan = plans.find(p => p.id === subscription?.plan_id);
              const currentPlanPrice = currentSubscriptionPlan ? currentSubscriptionPlan.price : (subscription ? parseFloat(subscription.plan_price) : 0);
              
              const isLesserPlan = plan.price < currentPlanPrice;

              return (
                <Card key={plan.id} className={`flex flex-col ${isCurrentPlan ? 'border-primary ring-1 ring-primary' : ''}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle>{plan.name}</CardTitle>
                      {isCurrentPlan && <Badge>Current</Badge>}
                    </div>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="mb-4">
                      {discount > 0 ? (
                        <div className="flex flex-col">
                           <span className="text-muted-foreground line-through text-sm">
                             {symbol}{originalPrice.toLocaleString()}
                           </span>
                           <div className="flex items-baseline gap-2">
                             <span className="text-3xl font-bold">{symbol}{finalPrice.toLocaleString()}</span>
                             <Badge variant="secondary" className="text-green-600 bg-green-100 border-green-200">
                               Save {symbol}{discount.toLocaleString()}
                             </Badge>
                           </div>
                        </div>
                      ) : (
                        <span className="text-3xl font-bold">{symbol}{originalPrice.toLocaleString()}</span>
                      )}
                      <span className="text-muted-foreground text-sm">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                    </div>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{plan.max_team_members > 9999 ? 'Unlimited' : `Up to ${plan.max_team_members}`} team members</span>
                      </li>
                      {plan.features && plan.features.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {!isLesserPlan && (
                      <Button 
                        className="w-full" 
                        variant={isCurrentPlan ? "outline" : "default"}
                        disabled={isCurrentPlan || !!processingId}
                        onClick={() => handleUpgrade(plan)}
                      >
                        {processingId === plan.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          isCurrentPlan ? "Current Plan" : (plan.price === 0 ? "Switch to Free" : "Upgrade")
                        )}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Transaction History */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <History className="h-6 w-6" />
              <h2 className="text-2xl font-bold tracking-tight">Billing History</h2>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date?.from ? (
                      date.to ? (
                        <>
                          {format(date.from, "LLL dd, y")} -{" "}
                          {format(date.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(date.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <div className="flex justify-center items-center">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{format(new Date(tx.created_at), 'PPP')}</TableCell>
                        <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                        <TableCell>{tx.plan_name || 'N/A'}</TableCell>
                        <TableCell>
                          {tx.currency} {Number(tx.amount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'success' ? 'default' : tx.status === 'pending' ? 'outline' : 'destructive'} className="capitalize">
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setSelectedTransaction(tx)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div className="p-4 border-t">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious 
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    
                    <PaginationItem>
                      <span className="text-sm text-muted-foreground px-2">
                        Page {page} {totalPages > 1 && `of ${totalPages}`}
                      </span>
                    </PaginationItem>
                    
                    <PaginationItem>
                      <PaginationNext 
                        onClick={() => setPage(p => (totalPages > page ? p + 1 : p))}
                        className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransaction(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Transaction Details</DialogTitle>
              <DialogDescription>
                Reference: {selectedTransaction?.reference}
              </DialogDescription>
            </DialogHeader>
            
            {selectedTransaction && (
               <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                     <div className="space-y-1">
                        <Label className="text-muted-foreground">Date</Label>
                        <div className="font-medium">{format(new Date(selectedTransaction.created_at), 'PPP pp')}</div>
                     </div>
                     <div className="space-y-1">
                        <Label className="text-muted-foreground">Amount</Label>
                        <div className="font-medium">{selectedTransaction.currency} {Number(selectedTransaction.amount).toLocaleString()}</div>
                     </div>
                     <div className="space-y-1">
                        <Label className="text-muted-foreground">Status</Label>
                        <div>
                          <Badge variant={selectedTransaction.status === 'success' ? 'default' : selectedTransaction.status === 'pending' ? 'outline' : 'destructive'} className="capitalize">
                            {selectedTransaction.status}
                          </Badge>
                        </div>
                     </div>
                     <div className="space-y-1">
                        <Label className="text-muted-foreground">Plan</Label>
                        <div className="font-medium">{selectedTransaction.plan_name || 'N/A'}</div>
                     </div>
                     {selectedTransaction.transaction_type && (
                        <div className="space-y-1">
                          <Label className="text-muted-foreground">Type</Label>
                          <div className="font-medium capitalize">{selectedTransaction.transaction_type}</div>
                        </div>
                     )}
                  </div>
                  
                  {selectedTransaction.gateway_response && (
                    <div>
                      <Label className="text-muted-foreground mb-2 block">Gateway Response</Label>
                      <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto">
                         <pre className="text-xs font-mono">{JSON.stringify(selectedTransaction.gateway_response, null, 2)}</pre>
                      </div>
                    </div>
                  )}
               </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedPlanForCheckout} onOpenChange={(open) => !open && setSelectedPlanForCheckout(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Subscription</DialogTitle>
              <DialogDescription>
                Review your plan selection before proceeding to payment.
              </DialogDescription>
            </DialogHeader>
            
            {selectedPlanForCheckout && (
              <div className="space-y-6 pt-4">
                <div className="space-y-2">
                  <h3 className="font-medium text-lg">{selectedPlanForCheckout.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedPlanForCheckout.description}</p>
                </div>
                
                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({billingCycle})</span>
                    <span>
                      {currency === 'USD' ? '$' : '₦'}
                      {currency === 'USD' 
                        ? selectedPlanForCheckout.price.toLocaleString() 
                        : Math.round(selectedPlanForCheckout.price * exchangeRate).toLocaleString()}
                    </span>
                  </div>
                  
                  {parseFloat(selectedPlanForCheckout.discount || "0") > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Discount</span>
                      <span>
                        - {currency === 'USD' ? '$' : '₦'}
                        {currency === 'USD'
                          ? parseFloat(selectedPlanForCheckout.discount || "0").toLocaleString()
                          : Math.round(parseFloat(selectedPlanForCheckout.discount || "0") * exchangeRate).toLocaleString()}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex justify-between font-bold text-lg border-t pt-3">
                    <span>Total Pay</span>
                    <span>
                      {currency === 'USD' ? '$' : '₦'}
                      {(
                        (currency === 'USD' 
                          ? selectedPlanForCheckout.price 
                          : Math.round(selectedPlanForCheckout.price * exchangeRate)) -
                        (currency === 'USD'
                          ? parseFloat(selectedPlanForCheckout.discount || "0")
                          : Math.round(parseFloat(selectedPlanForCheckout.discount || "0") * exchangeRate))
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <Button variant="outline" onClick={() => setSelectedPlanForCheckout(null)}>Cancel</Button>
                  <Button onClick={confirmUpgrade} disabled={!!processingId}>
                    {processingId === selectedPlanForCheckout.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Proceed to Payment
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
