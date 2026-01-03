import React, { useEffect, useState } from "react";
import Layout from "@/components/layout";
import { api } from "@/lib/api-client";
import { Transfer } from "@shared/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TransferHistory() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Transfer Filter & Pagination States
  const [transferSearch, setTransferSearch] = useState("");
  const [transferStatus, setTransferStatus] = useState("all");
  const [transferStartDate, setTransferStartDate] = useState("");
  const [transferEndDate, setTransferEndDate] = useState("");
  const [transferPage, setTransferPage] = useState(1);
  const [transferLimit, setTransferLimit] = useState(20);
  const [transferTotal, setTransferTotal] = useState(0);

  const fetchTransfers = async (currentPage = transferPage) => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (transferSearch) queryParams.append("search", transferSearch);
      if (transferStatus && transferStatus !== "all") queryParams.append("status", transferStatus);
      if (transferStartDate) queryParams.append("startDate", transferStartDate);
      if (transferEndDate) queryParams.append("endDate", transferEndDate);
      queryParams.append("page", currentPage.toString());
      queryParams.append("limit", transferLimit.toString());

      const res = await api.get<{
          success: boolean, 
          data: Transfer[], 
          pagination: { total: number, page: number, limit: number } 
      }>(`/transfers?${queryParams.toString()}`);
      
      if (res.data.success) {
          setTransfers(res.data.data);
          setTransferTotal(res.data.pagination.total);
      } else {
          setTransfers([]);
      }
    } catch (error) {
      console.error("Failed to fetch transfers", error);
      toast({
        title: "Error",
        description: "Failed to load transfer history",
        variant: "destructive",
      });
    } finally {
        setLoading(false);
    }
  };

  const handleTransferSearch = () => {
    setTransferPage(1);
    fetchTransfers(1);
  };

  const retryTransfer = async (id: string) => {
    setRetryingId(id);
    try {
      await api.post(`/transfers/${id}/retry`);
      toast({ title: "Success", description: "Transfer retry initiated" });
      fetchTransfers();
    } catch (error) {
      toast({ title: "Error", description: "Failed to retry transfer", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  useEffect(() => {
    fetchTransfers(transferPage);
  }, [transferPage]);

  if (loading && transfers.length === 0) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transfer History</h2>
          <p className="text-muted-foreground">View and manage your transfer history.</p>
        </div>

        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
            <div className="grid w-full max-w-sm items-center gap-1.5">
            <p className="text-sm font-medium">Search</p>
            <Input 
                placeholder="Recipient or Amount" 
                value={transferSearch}
                onChange={(e) => setTransferSearch(e.target.value)}
            />
            </div>
            
            <div className="grid w-full max-w-[150px] items-center gap-1.5">
                <p className="text-sm font-medium">Status</p>
                <Select value={transferStatus} onValueChange={setTransferStatus}>
                <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
                </Select>
            </div>

            <div className="grid w-full max-w-[150px] items-center gap-1.5">
                <p className="text-sm font-medium">Start Date</p>
                <Input 
                type="date" 
                value={transferStartDate}
                onChange={(e) => setTransferStartDate(e.target.value)}
                />
            </div>

            <div className="grid w-full max-w-[150px] items-center gap-1.5">
                <p className="text-sm font-medium">End Date</p>
                <Input 
                type="date" 
                value={transferEndDate}
                onChange={(e) => setTransferEndDate(e.target.value)}
                />
            </div>

            <Button onClick={handleTransferSearch}>
            <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
        </div>

        <Card>
            <CardHeader>
            <CardTitle>Transfers</CardTitle>
            </CardHeader>
            <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {Array.isArray(transfers) && transfers.map((t) => (
                    <TableRow key={t.id}>
                    <TableCell>{t.recipient_name}</TableCell>
                    <TableCell>{t.currency} {t.amount.toLocaleString()}</TableCell>
                    <TableCell>
                        <Badge variant={t.status === 'success' ? 'default' : t.status === 'failed' ? 'destructive' : 'secondary'}>
                        {t.status}
                        </Badge>
                        {t.failure_reason && <p className="text-xs text-red-500 mt-1">{t.failure_reason}</p>}
                    </TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                        {t.status === 'failed' && (
                        <Button variant="outline" size="sm" onClick={() => retryTransfer(t.id)} disabled={retryingId === t.id}>
                            {retryingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                            Retry
                        </Button>
                        )}
                    </TableCell>
                    </TableRow>
                ))}
                {transfers.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={5} className="text-center h-24">
                            No transfers found.
                        </TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
            
            <div className="flex items-center justify-end space-x-2 py-4 border-t mt-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferPage(p => Math.max(1, p - 1))}
                    disabled={transferPage === 1}
                >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                </Button>
                <div className="text-sm font-medium">Page {transferPage}</div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTransferPage(p => p + 1)}
                    disabled={transferPage * transferLimit >= transferTotal}
                >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
            </div>
            </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
