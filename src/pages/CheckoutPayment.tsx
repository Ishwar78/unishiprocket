import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Copy, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

type PaymentSettings = {
  upiQrImage: string;
  upiId: string;
  beneficiaryName: string;
  instructions: string;
};

type RazorpaySettings = {
  keyId: string;
  currency: string;
  isActive: boolean;
};

/**
 * Safe response parser that reads the body once and handles JSON parsing errors
 * Prevents "body stream already read" errors by reading as text first
 */
async function safeParseResponse<T = any>(response: Response): Promise<T> {
  const bodyText = await response.text();

  if (!bodyText) {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(bodyText) as T;
  } catch {
    if (!response.ok) {
      throw new Error(bodyText || `HTTP ${response.status} ${response.statusText}`);
    }
    throw new Error('Invalid JSON response from server');
  }
}

const CheckoutPayment = () => {
  const { items, subtotal, discountAmount, total, appliedCoupon, clearCart, placeOrder } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'upi' | 'cod'>('razorpay');
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [razorpaySettings, setRazorpaySettings] = useState<RazorpaySettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [upiTransactionId, setUpiTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState(false);

  // Customer details
  const [customerDetails, setCustomerDetails] = useState({
    name: localStorage.getItem('userName') || '',
    phone: localStorage.getItem('userPhone') || '',
    address: localStorage.getItem('userAddress') || '',
    city: localStorage.getItem('userCity') || '',
    state: localStorage.getItem('userState') || '',
    pincode: localStorage.getItem('userPincode') || '',
    landmark: localStorage.getItem('userLandmark') || '',
  });

  const [shippingCharges, setShippingCharges] = useState(0);
  const [fetchingCharges, setFetchingCharges] = useState(false);

  const buildUpiUri = (scheme?: string) => {
    const pa = encodeURIComponent(paymentSettings?.upiId || '');
    if (!pa) return '';
    const pn = encodeURIComponent(paymentSettings?.beneficiaryName || '');
    const am = encodeURIComponent((total || 0).toFixed(2));
    const tn = encodeURIComponent('Order payment at UNI10');
    const base = scheme ? scheme : 'upi://pay';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
  };

  const fetchShippingCharges = async (pincode: string) => {
    if (!pincode || pincode.length < 5) {
      setShippingCharges(0);
      return;
    }

    try {
      setFetchingCharges(true);
      const response = await fetch('/api/shipping/charges', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pincode }),
      });

      const data = await response.json();

      if (data.ok && data.data) {
        const charges = data.data.available ? Number(data.data.charges || 0) : 0;
        setShippingCharges(charges);
      } else {
        setShippingCharges(0);
      }
    } catch (error) {
      console.error('Failed to fetch shipping charges:', error);
      setShippingCharges(0);
    } finally {
      setFetchingCharges(false);
    }
  };

  const openUpiApp = (scheme?: string) => {
    const uri = buildUpiUri(scheme);
    if (!uri) {
      toast({ title: 'UPI not configured', description: 'UPI ID is missing', variant: 'destructive' });
      return;
    }
    const startVisible = document.visibilityState;
    try {
      window.location.href = uri;
    } catch (_) {}
    if (scheme) {
      setTimeout(() => {
        if (document.visibilityState === startVisible) {
          const fallback = buildUpiUri('upi://pay');
          try { window.location.href = fallback; } catch (_) {}
        }
      }, 1200);
    }
  };

  useEffect(() => {
    fetchPaymentSettings();
    fetchRazorpaySettings();
  }, []);

  // Fetch shipping charges when pincode changes
  useEffect(() => {
    if (customerDetails.pincode) {
      fetchShippingCharges(customerDetails.pincode);
    }
  }, [customerDetails.pincode]);

  const fetchPaymentSettings = async () => {
    try {
      setLoadingSettings(true);
      const { ok, json } = await api('/api/settings/payments');
      if (ok && json?.data) {
        const p = json.data as any;
        setPaymentSettings({
          upiQrImage:
            typeof p.upiQrImage === 'string' && p.updatedAt
              ? `${p.upiQrImage}?v=${encodeURIComponent(p.updatedAt)}`
              : p.upiQrImage || '',
          upiId: p.upiId || '',
          beneficiaryName: p.beneficiaryName || '',
          instructions: p.instructions || '',
        });
      }
    } catch (error) {
      console.error('Failed to fetch payment settings:', error);
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchRazorpaySettings = async () => {
    try {
      const { ok, json } = await api('/api/settings/razorpay/public');
      if (ok && json?.data) {
        const r = json.data as any;
        setRazorpaySettings({
          keyId: r.keyId || '',
          currency: r.currency || 'INR',
          isActive: r.isActive || false,
        });
      }
    } catch (error) {
      console.error('Failed to fetch Razorpay settings:', error);
    }
  };

  const validateCustomerDetails = () => {
    if (!customerDetails.name || !customerDetails.phone || !customerDetails.address || !customerDetails.city || !customerDetails.state || !customerDetails.pincode) {
      toast({
        title: 'Missing Details',
        description: 'Please fill in all delivery details before proceeding',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const handleCodOrder = async () => {
    if (!validateCustomerDetails()) return;

    try {
      setSubmitting(true);

      const totalWithShipping = total + shippingCharges;

      const payload: any = {
        name: customerDetails.name,
        phone: customerDetails.phone,
        address: customerDetails.address,
        city: customerDetails.city,
        state: customerDetails.state,
        pincode: customerDetails.pincode,
        landmark: customerDetails.landmark,
        paymentMethod: 'COD',
        items: items.map((i) => ({
          id: i.id,
          productId: i.id,
          title: i.title,
          price: i.price,
          qty: i.qty,
          meta: i.meta,
          image: i.image,
          size: i.meta?.size || undefined,
        })),
        subtotal,
        discountAmount,
        shipping: shippingCharges,
        total: totalWithShipping,
        coupon: appliedCoupon
          ? { code: appliedCoupon.code, discount: appliedCoupon.discount }
          : undefined,
        status: 'pending',
        customer: {
          name: customerDetails.name,
          phone: customerDetails.phone,
          address: customerDetails.address,
          city: customerDetails.city,
          state: customerDetails.state,
          pincode: customerDetails.pincode,
          landmark: customerDetails.landmark,
        },
      };

      const res = await placeOrder(payload);

      if (res.ok) {
        const newOrderId = String(
          (res.data?._id || res.data?.id) ?? 'local_' + Date.now()
        );

        try {
          const raw = localStorage.getItem('uni_orders_v1');
          const arr = raw ? (JSON.parse(raw) as any[]) : [];
          const order = {
            _id: newOrderId,
            name: customerDetails.name,
            phone: customerDetails.phone,
            address: customerDetails.address,
            city: customerDetails.city,
            state: customerDetails.state,
            pincode: customerDetails.pincode,
            total,
            paymentMethod: 'COD',
            status: 'pending',
            createdAt: new Date().toISOString(),
            items: items.map((i) => ({
              id: i.id,
              title: i.title,
              price: i.price,
              qty: i.qty,
              image: i.image,
              size: i.meta?.size,
            })),
          } as any;
          localStorage.setItem('uni_orders_v1', JSON.stringify([order, ...arr]));
          localStorage.setItem('uni_last_order_id', newOrderId);
        } catch (e) {
          console.error('Failed to persist local order', e);
        }

        toast({
          title: 'Order placed',
          description: `Order #${newOrderId}: Cash on Delivery selected. Your order has been placed successfully.`,
        });

        try {
          window.dispatchEvent(
            new CustomEvent('order:placed', { detail: { id: newOrderId } })
          );
        } catch {}

        clearCart();
        navigate('/dashboard', { replace: true });
      } else {
        const errorMsg = res.error?.message || String(res.error ?? 'Unknown error');
        toast({
          title: 'Order failed',
          description: errorMsg,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Order failed',
        description: error?.message || 'Could not place COD order',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRazorpayPayment = async () => {
    try {
      if (!validateCustomerDetails()) return;

      setSubmitting(true);

      // Ensure Razorpay SDK is loaded
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
          if (existing) return existing.addEventListener('load', () => resolve());
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
          document.body.appendChild(s);
        });
      }

      // Create order on backend
      const totalWithShipping = total + shippingCharges;

      const response = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          amount: totalWithShipping,
          currency: 'INR',
          items,
          appliedCoupon,
          shipping: shippingCharges,
        }),
      });

      const data = await safeParseResponse<any>(response);

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Failed to create order');
      }

      const { orderId, keyId, amount, currency } = data.data || {};

      if (!orderId || typeof orderId !== 'string' || !orderId.trim() || !keyId || typeof keyId !== 'string' || !keyId.trim() || !amount || Number(amount) <= 0) {
        alert('Invalid order details. Please refresh and try again.');
        setSubmitting(false);
        return;
      }

      toast({
        title: 'Payment initiated successfully',
        description: 'Opening secure payment gateway...',
      });

      const options = {
        key: keyId.trim(),
        amount: amount,
        currency: currency || 'INR',
        name: 'UNI10',
        description: `Order for ₹${total}`,
        order_id: orderId.trim(),
        handler: async (response: any) => {
          try {
            const authToken = localStorage.getItem('token') || '';
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify({
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
                items,
                appliedCoupon,
                total,
                name: customerDetails.name,
                phone: customerDetails.phone,
                address: customerDetails.address,
                city: customerDetails.city,
                state: customerDetails.state,
                pincode: customerDetails.pincode,
              }),
            });

            const vjson = await safeParseResponse<any>(verifyRes);

            if (!verifyRes.ok || !vjson.ok) {
              throw new Error(vjson.message || 'Verification failed');
            }

            toast({
              title: 'Payment successful ✓',
              description: 'Your order has been confirmed',
            });
            clearCart();
            navigate('/orders/success');
          } catch (error: any) {
            toast({
              title: 'Payment Verification Failed',
              description: error?.message || 'Failed to verify payment',
              variant: 'destructive',
            });
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            console.warn('Payment cancelled by user.');
            setSubmitting(false);
          },
        },
        prefill: {
          name: customerDetails.name,
          email: localStorage.getItem('userEmail') || '',
          contact: customerDetails.phone,
        },
        theme: {
          color: '#EF4444',
        },
      };

      const razorpayWindow = (window as any).Razorpay;
      if (!razorpayWindow) {
        throw new Error('Razorpay SDK not loaded');
      }

      const rzp = new razorpayWindow(options);
      rzp.on('payment.failed', (error: any) => {
        toast({
          title: 'Payment Failed',
          description: error?.error?.description || 'Payment could not be processed',
          variant: 'destructive',
        });
        setSubmitting(false);
      });
      rzp.open();
    } catch (error: any) {
      toast({
        title: 'Server not reachable. Try again later.',
        description: error?.message || 'Failed to initiate payment',
        variant: 'destructive',
      });
      setSubmitting(false);
    }
  };

  const handleUpiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!upiTransactionId.trim()) {
      toast({
        title: 'Transaction ID Required',
        description: 'Please enter your UPI transaction ID',
        variant: 'destructive',
      });
      return;
    }

    if (!validateCustomerDetails()) return;

    try {
      setSubmitting(true);

      const totalWithShipping = total + shippingCharges;

      const response = await fetch('/api/payment/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          transactionId: upiTransactionId.trim(),
          amount: totalWithShipping,
          paymentMethod: 'UPI',
          items: items.map(i => ({ id: i.id, title: i.title, price: i.price, qty: i.qty, image: i.image, size: i.meta?.size, productId: i.id })),
          appliedCoupon,
          name: customerDetails.name,
          phone: customerDetails.phone,
          address: customerDetails.address,
          city: customerDetails.city,
          state: customerDetails.state,
          pincode: customerDetails.pincode,
          landmark: customerDetails.landmark,
          shipping: shippingCharges,
        }),
      });

      const data = await safeParseResponse<any>(response);

      if (response.ok && data.ok) {
        toast({
          title: 'Payment Submitted!',
          description: 'Your payment proof has been submitted. We will verify it shortly.',
        });
        setUpiTransactionId('');
        clearCart();
        navigate('/dashboard');
      } else {
        throw new Error(data.message || 'Failed to submit payment');
      }
    } catch (error: any) {
      toast({
        title: 'Submission Error',
        description: error?.message || 'Failed to submit payment proof',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyUpiId = async () => {
    if (paymentSettings?.upiId) {
      try {
        await navigator.clipboard.writeText(paymentSettings.upiId);
        setCopiedUpiId(true);
        setTimeout(() => setCopiedUpiId(false), 2000);
        toast({
          title: 'Copied!',
          description: 'UPI ID copied to clipboard',
        });
      } catch (error) {
        toast({
          title: 'Copy Failed',
          description: 'Could not copy UPI ID',
          variant: 'destructive',
        });
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold mb-4">Your cart is empty</h1>
            <p className="text-muted-foreground mb-8">Please add items to your cart before proceeding to checkout.</p>
            <Link to="/shop">
              <Button size="lg">Continue Shopping</Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <Link to="/cart" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cart
        </Link>

        <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-12">
          Complete Your <span className="text-primary">Payment</span>
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Delivery & Payment Options */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Details */}
            <Card className="p-4 rounded-xl text-sm shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">Delivery Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    value={customerDetails.name}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={customerDetails.phone}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, phone: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="address">Street Address *</Label>
                  <Input
                    id="address"
                    type="text"
                    placeholder="House number, street name"
                    value={customerDetails.address}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, address: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="City"
                    value={customerDetails.city}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    type="text"
                    placeholder="State"
                    value={customerDetails.state}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, state: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="pincode">Pincode *</Label>
                  <Input
                    id="pincode"
                    type="text"
                    placeholder="6-8 digit pincode"
                    value={customerDetails.pincode}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, pincode: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="landmark">Landmark (Optional)</Label>
                  <Input
                    id="landmark"
                    type="text"
                    placeholder="e.g., Near Market, Opposite Park"
                    value={customerDetails.landmark}
                    onChange={(e) => setCustomerDetails({ ...customerDetails, landmark: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Help delivery partner locate your address</p>
                </div>
              </div>
            </Card>

            {/* COD Option */}
            <Card className="p-4 rounded-xl text-sm shadow-sm border border-gray-200">
              <div className="flex items-center gap-4 mb-6">
                <div
                  className="w-5 h-5 rounded-full border-2 cursor-pointer"
                  onClick={() => setPaymentMethod('cod')}
                  style={{
                    borderColor: paymentMethod === 'cod' ? '#3b82f6' : '#d1d5db',
                    backgroundColor: paymentMethod === 'cod' ? '#3b82f6' : 'transparent',
                  }}
                />
                <div>
                  <h3 className="font-semibold text-lg">Cash on Delivery</h3>
                  <p className="text-sm text-muted-foreground">
                    Pay in cash when your order is delivered.
                  </p>
                </div>
              </div>

              {paymentMethod === 'cod' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Review your delivery details and place your COD order. Payment will be collected at the time of delivery.
                  </p>
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleCodOrder}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Placing COD Order...
                      </>
                    ) : (
                      'Place COD Order'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    COD availability may vary by pincode.
                  </p>
                </div>
              )}
            </Card>

            {/* Razorpay Option */}
            <Card className={`p-4 rounded-xl text-sm shadow-sm border ${razorpaySettings?.isActive ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
              <div className="flex items-center gap-4 mb-6">
                <div
                  className={`w-5 h-5 rounded-full border-2 ${razorpaySettings?.isActive ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  onClick={() => razorpaySettings?.isActive && setPaymentMethod('razorpay')}
                  style={{
                    borderColor: paymentMethod === 'razorpay' && razorpaySettings?.isActive ? '#3b82f6' : '#d1d5db',
                    backgroundColor: paymentMethod === 'razorpay' && razorpaySettings?.isActive ? '#3b82f6' : 'transparent',
                  }}
                />
                <div>
                  <h3 className="font-semibold text-lg">Pay with Razorpay</h3>
                  <p className="text-sm text-muted-foreground">Quick and secure payment</p>
                  {!razorpaySettings?.isActive && (
                    <p className="text-xs text-destructive mt-1">Currently unavailable</p>
                  )}
                </div>
              </div>

              {paymentMethod === 'razorpay' && razorpaySettings?.isActive && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Click the button below to complete your payment securely using Razorpay.
                  </p>
                  <Button
                    size="lg"
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    onClick={handleRazorpayPayment}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Pay with Razorpay'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    Secure payment via Razorpay
                  </p>
                </div>
              )}
              {!razorpaySettings?.isActive && (
                <p className="text-sm text-muted-foreground">
                  Razorpay payment is currently not available. Please use UPI or other available methods.
                </p>
              )}
            </Card>

            {/* 🔥 UPI QR OPTION REMOVED FROM HERE – baaki sab as-is rakha hai */}
          </div>

          {/* Order Summary */}
          <div>
            <Card className="p-4 rounded-xl text-sm shadow-sm sticky top-24">
              <h2 className="text-xl font-bold mb-6">Payment Summary</h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>

                {appliedCoupon && discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-700 dark:text-green-300">
                    <span>Discount ({appliedCoupon.discount}%)</span>
                    <span>-₹{discountAmount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between">
                    <span className="font-semibold">Total Amount</span>
                    <span className="text-2xl font-bold text-primary">₹{total.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6 space-y-3">
                <h3 className="font-semibold text-sm">Items ({items.length})</h3>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>{item.title}</span>
                        <span>x{item.qty}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>₹{item.price.toLocaleString('en-IN')} each</span>
                        <span className="font-medium">
                          ₹{(item.qty * item.price).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Link to="/cart" className="block mt-6">
                <Button variant="outline" className="w-full">
                  Modify Cart
                </Button>
              </Link>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CheckoutPayment;
