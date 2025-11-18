import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, AlertCircle, Save } from 'lucide-react';
import { toast } from 'sonner';

interface OrderRow {
  id: string;
  name: string;
  phone: string;
  total: number;
  status: string;
  trackingId: string;
  createdAt: string;
}

export default function AdminTracking() {
  useAdminAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [totalPages, setTotalPages] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editTrackingId, setEditTrackingId] = useState('');

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    paid: 'bg-blue-100 text-blue-800',
    shipped: 'bg-yellow-100 text-yellow-800',
    delivered: 'bg-green-100 text-green-800',
    returned: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  useEffect(() => {
    fetchStats();
    fetchOrders();
  }, [page, statusFilter, limit]);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/orders/stats');
      const data = await response.json();
      if (data.ok) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError('');

    try {
      let url = `/api/orders?page=${page}&limit=${limit}`;
      if (statusFilter) {
        url += `&status=${statusFilter}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (!data.ok) {
        setError(data.message || 'Failed to fetch orders');
        return;
      }

      setOrders(
        data.data.map((order: any) => ({
          id: String(order._id || order.id),
          name: order.name || '',
          phone: order.phone || '',
          total: order.total || 0,
          status: order.status || 'pending',
          trackingId: order.trackingId || '',
          createdAt: order.createdAt || '',
        }))
      );

      setTotalPages(Math.ceil((data.pagination?.total || 0) / limit));
    } catch (err) {
      setError('Failed to fetch orders. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (order: OrderRow) => {
    setEditingId(order.id);
    setEditStatus(order.status);
    setEditTrackingId(order.trackingId);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditStatus('');
    setEditTrackingId('');
  };

  const saveOrder = async (orderId: string) => {
    if (!editStatus) {
      toast.error('Please select a status');
      return;
    }

    if (editStatus === 'shipped' && !editTrackingId.trim()) {
      toast.error('Tracking ID is required for shipped status');
      return;
    }

    try {
      setUpdatingId(orderId);
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          status: editStatus,
          trackingId: editStatus === 'shipped' ? editTrackingId.trim() : '',
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        toast.error(data.message || 'Failed to update order');
        return;
      }

      toast.success('Order updated successfully');
      setEditingId(null);
      setEditStatus('');
      setEditTrackingId('');
      await fetchOrders();
    } catch (err) {
      toast.error('Failed to update order');
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-20 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Header */}
          <div className="border-b pb-6">
            <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
            <p className="text-gray-600 mt-1">Manage order status and add tracking information</p>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
                    <p className="text-sm text-gray-600 mt-1">Total Orders</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-600">{stats.pending || 0}</p>
                    <p className="text-sm text-gray-600 mt-1">Pending</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-blue-600">{stats.paid || 0}</p>
                    <p className="text-sm text-gray-600 mt-1">Paid</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-purple-600">{stats.shipped || 0}</p>
                    <p className="text-sm text-gray-600 mt-1">Shipped</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-green-600">{stats.delivered || 0}</p>
                    <p className="text-sm text-gray-600 mt-1">Delivered</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Order Status
                  </label>
                  <Select value={statusFilter} onValueChange={(value) => {
                    setStatusFilter(value);
                    setPage(1);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="returned">Returned</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-2">
                    Items Per Page
                  </label>
                  <Select value={String(limit)} onValueChange={(value) => {
                    setLimit(parseInt(value));
                    setPage(1);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card>
            <CardHeader>
              <CardTitle>Orders</CardTitle>
              <CardDescription>
                Showing {orders.length} orders (Page {page} of {totalPages})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tracking ID</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm">
                            {order.id.slice(-8).toUpperCase()}
                          </TableCell>
                          <TableCell className="font-medium">{order.name}</TableCell>
                          <TableCell className="text-sm">{order.phone}</TableCell>
                          <TableCell className="font-semibold">
                            ₹{order.total.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {editingId === order.id ? (
                              <Select value={editStatus} onValueChange={setEditStatus}>
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="paid">Paid</SelectItem>
                                  <SelectItem value="shipped">Shipped</SelectItem>
                                  <SelectItem value="delivered">Delivered</SelectItem>
                                  <SelectItem value="returned">Returned</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge className={statusColors[order.status?.toLowerCase()] || 'bg-gray-100'}>
                                {order.status?.toUpperCase()}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingId === order.id && editStatus === 'shipped' ? (
                              <Input
                                placeholder="Enter tracking ID"
                                value={editTrackingId}
                                onChange={(e) => setEditTrackingId(e.target.value)}
                                className="w-32 text-sm"
                              />
                            ) : (
                              <span className="text-sm text-gray-600">
                                {order.trackingId || '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingId === order.id ? (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveOrder(order.id)}
                                  disabled={updatingId === order.id}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  {updatingId === order.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={cancelEdit}
                                  disabled={updatingId === order.id}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(order)}
                              >
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {orders.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-600">No orders found</p>
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <div className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
