import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Loader2, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

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

export const CheckoutModal: React.FC<Props> = ({ open, setOpen }) => {
  const {
    items,
    subtotal,
    discountAmount,
    total,
    appliedCoupon,
    applyCoupon,
    removeCoupon,
    clearCart,
    placeOrder, // 👈 yahan se placeOrder bhi le rahe hain (dusre code jaisa)
  } = useCart();

  const { toast } = useToast();
  const navigate = useNavigate();

  const [loadingSettings, setLoadingSettings] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings | null>(null);
  const [razorpaySettings, setRazorpaySettings] = useState<RazorpaySettings | null>(null);

  const [payment, setPayment] = useState<"COD" | "UPI" | "RAZORPAY">("COD");
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [upiTxnId, setUpiTxnId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // customer details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState(""); // ⭐ NEW FIELD
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");

  // ✅ Coupon states (same style as Cart)
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchPaymentSettings();
      fetchRazorpaySettings();
    }
  }, [open]);

  async function fetchPaymentSettings() {
    try {
      setLoadingSettings(true);
      const { ok, json } = await api("/api/settings/payments");
      if (ok && json?.data) {
        const p = json.data as any;
        setPaymentSettings({
          upiQrImage: p.upiQrImage || "",
          upiId: p.upiId || "",
          beneficiaryName: p.beneficiaryName || "",
          instructions: p.instructions || "",
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function fetchRazorpaySettings() {
    try {
      const { ok, json } = await api("/api/settings/razorpay/public");
      if (ok && json?.data) {
        const d = json.data as any;
        setRazorpaySettings({
          keyId: d.keyId || "",
          currency: d.currency || "INR",
          isActive: d.isActive || false,
        });
      }
    } catch (err) {
      console.error("Razorpay settings error:", err);
    }
  }

  const handleCopyUpiId = async () => {
    if (paymentSettings?.upiId) {
      await navigator.clipboard.writeText(paymentSettings.upiId);
      setCopiedUpiId(true);
      setTimeout(() => setCopiedUpiId(false), 2000);
      toast({ title: "Copied", description: "UPI ID copied to clipboard" });
    }
  };

  // ✅ Same coupon logic as Cart page
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Enter a coupon code");
      return;
    }

    setCouponLoading(true);
    setCouponError(null);

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ code: couponCode }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        applyCoupon({ code: data.data.code, discount: data.data.discount });
        setCouponCode("");
        toast({ title: `Coupon applied! ${data.data.discount}% off` });
      } else {
        setCouponError(data.message || "Invalid coupon");
      }
    } catch (error) {
      setCouponError("Failed to validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponCode("");
    setCouponError(null);
    toast({ title: "Coupon removed" });
  };

  async function handleRazorpayPayment() {
    try {
      // validations (landmark optional rakha hai)
      if (!name || !phone || !address || !city || !stateName || !pincode) {
        toast({
          title: "Missing details",
          description: "Please fill in all delivery details.",
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);

      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject();
          document.body.appendChild(s);
        });
      }

      const response = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({ amount: total, currency: "INR", items, appliedCoupon }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message || "Failed to create Razorpay order");

      const { orderId, keyId, amount, currency } = data.data;

      const options = {
        key: keyId,
        amount,
        currency,
        name: "UNI10",
        description: `Order for ₹${total}`,
        order_id: orderId,
        handler: async (res: any) => {
          try {
            const verify = await fetch("/api/payment/verify", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
              },
              body: JSON.stringify({
                razorpayPaymentId: res.razorpay_payment_id,
                razorpayOrderId: res.razorpay_order_id,
                razorpaySignature: res.razorpay_signature,
                items,
                appliedCoupon,
                total,
                name,
                phone,
                address,
                landmark, // ⭐ NEW FIELD SENT
                city,
                state: stateName,
                pincode,
              }),
            });
            const verifyJson = await verify.json();
            if (!verify.ok || !verifyJson.ok) throw new Error(verifyJson.message);
            toast({ title: "Payment successful ✓", description: "Your order has been confirmed." });
            clearCart();
            setOpen(false);
            navigate("/dashboard");
          } catch (err: any) {
            toast({
              title: "Payment verification failed",
              description: err.message,
              variant: "destructive",
            });
          }
        },
        modal: { ondismiss: () => setSubmitting(false) },
        theme: { color: "#EF4444" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      toast({ title: "Payment Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpiPaymentSubmit() {
    if (!upiTxnId.trim()) {
      toast({ title: "Transaction ID Required", description: "Please enter your UPI Txn ID", variant: "destructive" });
      return;
    }
    try {
      setSubmitting(true);
      const response = await fetch("/api/payment/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
        body: JSON.stringify({
          transactionId: upiTxnId.trim(),
          amount: total,
          paymentMethod: "UPI",
          items,
          appliedCoupon,
          name,
          phone,
          address,
          landmark, // ⭐ NEW FIELD SENT
          city,
          state: stateName,
          pincode,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.message);
      toast({ title: "Payment Submitted!", description: "We'll verify and confirm shortly." });
      clearCart();
      setOpen(false);
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ✅ COD LOGIC from second code – proper order create + placeOrder + localStorage
  const handleCodOrder = async () => {
    if (!name || !phone || !address) {
      toast({ title: "Please fill name, phone and address", variant: "destructive" });
      return;
    }
    if (!city || !stateName || !pincode) {
      toast({ title: "Please add city, state and pincode", variant: "destructive" });
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      toast({ title: "Enter a valid 6-digit pincode", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const payload: any = {
      name,
      phone,
      address,
      landmark, // ⭐ landmark included
      city,
      state: stateName,
      pincode,
      paymentMethod: "COD",
      items: items.map((i: any) => ({
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
      total,
      coupon: appliedCoupon
        ? { code: appliedCoupon.code, discount: appliedCoupon.discount }
        : undefined,
      status: "pending",
      customer: {
        name,
        phone,
        address,
        landmark,
        city,
        state: stateName,
        pincode,
      },
    };

    // 👇 coupon ko apply mark karne wala part (dusre code se)
    if (appliedCoupon) {
      try {
        const token = localStorage.getItem("token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        await fetch("/api/coupons/apply", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({ code: appliedCoupon.code }),
        });
      } catch (err) {
        console.warn("Failed to mark coupon as used:", err);
      }
    }

    const res = await placeOrder(payload);
    setSubmitting(false);

    if (res.ok) {
      const newOrderId = String(
        (res.data?._id || res.data?.id) ?? "local_" + Date.now()
      );

      try {
        const raw = localStorage.getItem("uni_orders_v1");
        const arr = raw ? (JSON.parse(raw) as any[]) : [];
        const order = {
          _id: newOrderId,
          name,
          phone,
          address,
          landmark,
          city,
          state: stateName,
          pincode,
          total,
          paymentMethod: "COD",
          status: "pending",
          createdAt: new Date().toISOString(),
          items: items.map((i: any) => ({
            id: i.id,
            title: i.title,
            price: i.price,
            qty: i.qty,
            image: i.image,
            size: i.meta?.size,
          })),
        } as any;
        localStorage.setItem("uni_orders_v1", JSON.stringify([order, ...arr]));
        localStorage.setItem("uni_last_order_id", newOrderId);
      } catch (e) {
        console.error("Failed to persist local order", e);
      }

      toast({
        title: "Order placed",
        description: `Order #${newOrderId}: Order placed successfully. Awaiting delivery confirmation.`,
      });
      try {
        window.dispatchEvent(
          new CustomEvent("order:placed", { detail: { id: newOrderId } })
        );
      } catch {}
      clearCart();
      setOpen(false);
      navigate("/dashboard", { replace: true });
    } else {
      const errorMsg = res.error?.message || String(res.error ?? "Unknown error");
      toast({
        title: "Order failed",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  async function handlePlaceOrder() {
    if (payment === "RAZORPAY") return handleRazorpayPayment();
    if (payment === "UPI") return handleUpiPaymentSubmit();
    // 👇 Ab COD pe bhi proper order create hoga
    return handleCodOrder();
  }

  const fieldBase =
    "w-full border border-border rounded px-3 py-2 text-foreground placeholder:text-muted-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>Complete your purchase</DialogDescription>
        </DialogHeader>

        {/* User Details */}
        <div className="space-y-3 mt-4">
          <input
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldBase}
          />
          <input
            placeholder="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldBase}
          />
          <textarea
            placeholder="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={fieldBase}
          />
          {/* ⭐ NEW LANDMARK FIELD */}
          <input
            placeholder="Landmark (optional)"
            value={landmark}
            onChange={(e) => setLandmark(e.target.value)}
            className={fieldBase}
          />
          <input
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className={fieldBase}
          />
          <input
            placeholder="State"
            value={stateName}
            onChange={(e) => setStateName(e.target.value)}
            className={fieldBase}
          />
          <input
            placeholder="Pincode"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            className={fieldBase}
          />
        </div>

        {/* Payment Selection */}
        <div className="border-t border-border pt-4 mt-4 space-y-2">
          <label className="font-medium">Payment Method</label>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={payment === "COD"}
                onChange={() => setPayment("COD")}
              />
              <span>Cash on Delivery</span>
            </label>
            {razorpaySettings?.isActive && (
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={payment === "RAZORPAY"}
                  onChange={() => setPayment("RAZORPAY")}
                />
                <span>Pay via Razorpay</span>
              </label>
            )}
            {/* Agar kabhi UPI ko bhi allow karna ho to yahan radio add kar sakta hai */}
          </div>
        </div>

        {/* UPI Section */}
        {payment === "UPI" && (
          <div className="border rounded-lg p-3 bg-muted space-y-3 mt-2">
            {loadingSettings ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading UPI...
              </div>
            ) : paymentSettings ? (
              <>
                {paymentSettings.upiQrImage && (
                  <img
                    src={paymentSettings.upiQrImage}
                    alt="UPI QR"
                    className="w-40 h-40 object-contain mx-auto"
                  />
                )}
                <p className="text-sm text-center">
                  {paymentSettings.instructions || "Scan this QR to pay"}
                </p>
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={handleCopyUpiId}>
                    {copiedUpiId ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    {copiedUpiId ? "Copied" : "Copy UPI ID"}
                  </Button>
                </div>
                <input
                  type="text"
                  placeholder="Enter UPI Transaction ID / UTR"
                  value={upiTxnId}
                  onChange={(e) => setUpiTxnId(e.target.value)}
                  className={fieldBase}
                />
              </>
            ) : (
              <p>UPI settings not found</p>
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="mt-4">
          <div className="w-full">
            {/* ✅ Coupon section added here */}
            <div className="mb-3 text-sm">
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Have a Coupon?
              </label>
              {!appliedCoupon ? (
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError(null);
                    }}
                    placeholder="Enter code"
                    className="flex-1 rounded px-2 py-1.5 text-sm
                               bg-white dark:bg-slate-900
                               text-slate-900 dark:text-slate-100
                               placeholder:text-slate-400 dark:placeholder:text-slate-500
                               caret-slate-900 dark:caret-slate-100
                               border border-slate-300 dark:border-slate-700
                               focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500"
                    disabled={couponLoading}
                  />
                  <Button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponCode.trim()}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 sm:h-9"
                  >
                    Apply
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-2 mb-2">
                  <div className="text-xs flex-1">
                    <span className="font-medium text-green-900 dark:text-green-100">
                      {appliedCoupon.code}
                    </span>
                    <span className="text-green-700 dark:text-green-300 ml-2 font-medium">
                      -{appliedCoupon.discount}%
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveCoupon}
                    className="h-6 px-2 text-xs w-full sm:w-auto"
                  >
                    Remove
                  </Button>
                </div>
              )}
              {couponError && (
                <p className="text-xs text-destructive mb-1">{couponError}</p>
              )}
            </div>

            {/* Totals (unchanged) */}
            <div className="border-t border-border pt-3 mb-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount ({appliedCoupon?.discount}%)</span>
                  <span>-₹{discountAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handlePlaceOrder}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
                  </>
                ) : payment === "RAZORPAY" ? (
                  "Pay via Razorpay"
                ) : payment === "UPI" ? (
                  "Submit Payment"
                ) : (
                  "Place Order"
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
