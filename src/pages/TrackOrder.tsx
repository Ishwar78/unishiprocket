import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, MapPin, Calendar, Truck, CheckCircle, AlertCircle } from 'lucide-react';

export default function TrackOrder() {
  const [activeTab, setActiveTab] = useState<'tracking' | 'phone'>('tracking');
  const [trackingInput, setTrackingInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackingResults, setTrackingResults] = useState<any>(null);
  const [phoneResults, setPhoneResults] = useState<any[]>([]);
  const navigate = useNavigate();

  const statusColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-800',
    paid: 'bg-blue-100 text-blue-800',
    shipped: 'bg-yellow-100 text-yellow-800',
    delivered: 'bg-green-100 text-green-800',
    returned: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
    in_transit: 'bg-blue-100 text-blue-800',
    out_for_delivery: 'bg-orange-100 text-orange-800',
    delivered_to_customer: 'bg-green-100 text-green-800',
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
      case 'delivered_to_customer':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'shipped':
      case 'in_transit':
        return <Truck className="w-5 h-5 text-blue-600" />;
      case 'out_for_delivery':
        return <MapPin className="w-5 h-5 text-orange-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const handleTrackingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingInput.trim()) {
      setError('Please enter a tracking number');
      return;
    }

    setLoading(true);
    setError('');
    setTrackingResults(null);

    try {
      const response = await fetch(`/api/tracking/${trackingInput.trim()}`);
      const data = await response.json();

      if (!data.ok) {
        setError(data.message || 'Failed to fetch tracking information');
        return;
      }

      setTrackingResults(data.data);
    } catch (err) {
      setError('Failed to fetch tracking information. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput.trim()) {
      setError('Please enter a phone number');
      return;
    }

    setLoading(true);
    setError('');
    setPhoneResults([]);

    try {
      const response = await fetch(`/api/tracking/search/phone/${phoneInput.trim()}`);
      const data = await response.json();

      if (!data.ok) {
        setError(data.message || 'Failed to search orders');
        return;
      }

      if (data.data.length === 0) {
        setError('No orders found with this phone number');
        return;
      }

      setPhoneResults(data.data);
    } catch (err) {
      setError('Failed to search orders. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Track Your Order</h1>
          <p className="text-lg text-gray-600">
            Monitor your parcel status in real-time with Shiprocket
          </p>
        </div>

        <div className="grid gap-6">
          {/* Tab Navigation */}
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeTab === 'tracking' ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab('tracking');
                setError('');
                setTrackingResults(null);
              }}
              className="flex-1"
            >
              By Tracking Number
            </Button>
            <Button
              variant={activeTab === 'phone' ? 'default' : 'outline'}
              onClick={() => {
                setActiveTab('phone');
                setError('');
                setPhoneResults([]);
              }}
              className="flex-1"
            >
              By Phone Number
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Tracking Number Tab */}
          {activeTab === 'tracking' && (
            <Card>
              <CardHeader>
                <CardTitle>Enter Tracking Number</CardTitle>
                <CardDescription>
                  Find your tracking number in your order confirmation email
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleTrackingSearch} className="space-y-4">
                  <Input
                    placeholder="e.g., 123456789"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    disabled={loading}
                  />
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Track Package
                  </Button>
                </form>

                {trackingResults && (
                  <div className="mt-8 space-y-6">
                    <div className="border rounded-lg p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-sm text-gray-600">Tracking Number</p>
                          <p className="text-2xl font-bold text-gray-900">
                            {trackingResults.trackingNumber}
                          </p>
                        </div>
                        {getStatusIcon(trackingResults.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Status</p>
                          <Badge className={statusColors[trackingResults.status?.toLowerCase()] || 'bg-gray-100'}>
                            {trackingResults.status?.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Carrier</p>
                          <p className="font-semibold">{trackingResults.carrier}</p>
                        </div>
                      </div>
                    </div>

                    <div className="border rounded-lg p-6">
                      <h3 className="font-semibold text-lg mb-4">Location & Updates</h3>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin className="w-5 h-5 text-blue-600 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-gray-600">Current Location</p>
                            <p className="font-medium text-gray-900">
                              {trackingResults.currentLocation || 'Information pending'}
                            </p>
                          </div>
                        </div>
                        {trackingResults.estimatedDelivery && (
                          <div className="flex items-start gap-3">
                            <Calendar className="w-5 h-5 text-green-600 mt-1 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-gray-600">Estimated Delivery</p>
                              <p className="font-medium text-gray-900">
                                {new Date(trackingResults.estimatedDelivery).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        )}
                        {trackingResults.lastUpdate && (
                          <div className="text-xs text-gray-500 pt-2">
                            Last updated: {new Date(trackingResults.lastUpdate).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {trackingResults.events && trackingResults.events.length > 0 && (
                      <div className="border rounded-lg p-6">
                        <h3 className="font-semibold text-lg mb-4">Delivery Timeline</h3>
                        <div className="space-y-4">
                          {trackingResults.events.map((event: any, idx: number) => (
                            <div key={idx} className="flex gap-4">
                              <div className="flex flex-col items-center">
                                <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                                {idx < trackingResults.events.length - 1 && (
                                  <div className="w-0.5 h-12 bg-gray-300"></div>
                                )}
                              </div>
                              <div className="pb-4">
                                <p className="font-medium text-gray-900">{event.status}</p>
                                {event.location && (
                                  <p className="text-sm text-gray-600">{event.location}</p>
                                )}
                                {event.timestamp && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(event.timestamp).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Phone Number Tab */}
          {activeTab === 'phone' && (
            <Card>
              <CardHeader>
                <CardTitle>Search by Phone Number</CardTitle>
                <CardDescription>
                  Enter the phone number associated with your order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePhoneSearch} className="space-y-4">
                  <Input
                    type="tel"
                    placeholder="e.g., 9876543210"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    disabled={loading}
                  />
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Search Orders
                  </Button>
                </form>

                {phoneResults.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <p className="text-sm text-gray-600">
                      Found {phoneResults.length} order{phoneResults.length !== 1 ? 's' : ''}
                    </p>
                    {phoneResults.map((order: any) => (
                      <Card key={order.orderId} className="border cursor-pointer hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                            <div>
                              <p className="text-xs text-gray-600">Order ID</p>
                              <p className="font-semibold text-sm text-gray-900">
                                {order.orderId.slice(-8).toUpperCase()}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Customer</p>
                              <p className="font-semibold text-sm text-gray-900">{order.name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Order Status</p>
                              <Badge className={statusColors[order.status?.toLowerCase()] || 'bg-gray-100'}>
                                {order.status?.toUpperCase()}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600">Tracking</p>
                              {order.tracking ? (
                                <Badge className="bg-green-100 text-green-800">
                                  {order.tracking.status?.toUpperCase()}
                                </Badge>
                              ) : order.trackingNumber ? (
                                <p className="text-sm font-mono">{order.trackingNumber}</p>
                              ) : (
                                <span className="text-xs text-gray-500">Pending</span>
                              )}
                            </div>
                          </div>
                          {order.tracking && order.tracking.currentLocation && (
                            <div className="mt-3 pt-3 border-t">
                              <p className="text-xs text-gray-600">Current Location</p>
                              <p className="text-sm text-gray-900">{order.tracking.currentLocation}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
