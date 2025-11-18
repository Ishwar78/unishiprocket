// routes/payment.js
const path = require('path');
// Load .env here as well, so even if index.js didn't load it (or cwd differs), keys are present.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const Product = require('../models/Product');
const SiteSetting = require('../models/SiteSetting');
const { authOptional, requireAuth } = require('../middleware/auth');
const { sendOrderConfirmationEmail } = require('../utils/emailService');

/* ------------------------------- Helpers -------------------------------- */

async function getSettingsDoc() {
  let settings = await SiteSetting.findOne();
  if (!settings) settings = await SiteSetting.create({});
  return settings;
}

// Return a live Razorpay instance (env first, DB fallback)
async function getRazorpayInstance() {
  const settings = await getSettingsDoc();
  const rz = settings?.razorpay || {};

  const keyId = process.env.RAZORPAY_KEY_ID || rz.keyId;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || rz.keySecret;

  // helpful visibility in logs (no secrets printed)
  console.log('[RZP] hasKeyId:', !!keyId, 'hasKeySecret:', !!keySecret);

  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured. Please contact support.');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// Public key for frontend (env-first, DB fallback)
async function getPublicKeyId() {
  if (process.env.RAZORPAY_KEY_ID) return process.env.RAZORPAY_KEY_ID;
  const settings = await getSettingsDoc();
  const rz = settings.razorpay || {};
  return rz.keyId || '';
}

// Resolve currency: request → .env → DB → INR
async function resolveCurrency(reqCurrency) {
  if (reqCurrency && typeof reqCurrency === 'string') {
    return String(reqCurrency).toUpperCase();
  }
  const envCur = (process.env.RAZORPAY_CURRENCY || '').trim().toUpperCase();
  if (envCur) return envCur;
  const settings = await getSettingsDoc();
  const rz = settings.razorpay || {};
  return (rz.currency || 'INR').toUpperCase();
}

const toPaise = (amount) => Math.round(Number(amount) * 100);

/* --------------------------- Create Razorpay order ---------------------- */
router.post('/create-order', authOptional, async (req, res) => {
  try {
    const { amount, currency, items, appliedCoupon } = req.body || {};

    // Validate amount (expect rupees)
    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ ok: false, message: 'Invalid amount provided' });
    }

    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: 'No items in order' });
    }

    // Instance + currency
    let rzp;
    try {
      rzp = await getRazorpayInstance();
    } catch (credError) {
      console.error('Razorpay configuration error:', credError.message);
      return res.status(500).json({ ok: false, message: 'Razorpay keys not configured.' });
    }

    const cur = await resolveCurrency(currency);

    // Amount in paise
    const amountInPaise = toPaise(parsedAmount);
    if (amountInPaise <= 0) {
      return res.status(400).json({ ok: false, message: 'Amount must be greater than zero' });
    }

    // Create order
    let razorpayOrder;
    try {
      razorpayOrder = await rzp.orders.create({
        amount: amountInPaise,
        currency: cur,
        receipt: `order_${Date.now()}`,
        notes: {
          items: Array.isArray(items) ? items.map(i => `${i.title} x${i.qty}`).join(', ') : '',
          appliedCoupon: appliedCoupon?.code || 'none',
        },
      });
    } catch (orderError) {
      console.error('Failed to create Razorpay order:', orderError?.message || orderError);
      return res.status(502).json({ ok: false, message: 'Failed to create order with payment provider' });
    }

    if (!razorpayOrder || !razorpayOrder.id) {
      console.error('Invalid Razorpay order response:', razorpayOrder);
      return res.status(502).json({ ok: false, message: 'Invalid response from payment provider' });
    }

    // Public key for frontend
    const keyId = await getPublicKeyId();
    if (!keyId) {
      console.error('Public Key ID not available');
      return res.status(500).json({ ok: false, message: 'Razorpay keys not configured.' });
    }

    return res.json({
      ok: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount, // paise
        currency: cur,
        keyId: keyId,
      },
    });
  } catch (error) {
    console.error('Create order error:', error);
    return res.status(500).json({ ok: false, message: error?.message || 'Failed to create order' });
  }
});

/* -------------------------- Verify Razorpay payment --------------------- */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      items,
      appliedCoupon,
      total,
      name,
      phone,
      address,
      city,
      state,
      pincode,
    } = req.body || {};

    if (!razorpayOrderId || !String(razorpayOrderId).trim()) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid Razorpay order ID' });
    }
    if (!razorpayPaymentId || !String(razorpayPaymentId).trim()) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid Razorpay payment ID' });
    }
    if (!razorpaySignature || !String(razorpaySignature).trim()) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid payment signature' });
    }

    // Get secret (env-first)
    let keySecret;
    try {
      await getRazorpayInstance(); // ensures config exists
      const settings = await getSettingsDoc();
      keySecret = process.env.RAZORPAY_KEY_SECRET || settings?.razorpay?.keySecret;
      if (!keySecret) throw new Error('Key secret not found');
    } catch (e) {
      console.error('Razorpay configuration error:', e.message);
      return res.status(500).json({ ok: false, message: 'Payment verification system not configured' });
    }

    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expected !== razorpaySignature) {
      return res.status(400).json({ ok: false, message: 'Invalid payment signature' });
    }

    if (Array.isArray(items) && items.length > 0) {
      if (!city || !String(city).trim())  return res.status(400).json({ ok: false, message: 'City is required' });
      if (!state || !String(state).trim()) return res.status(400).json({ ok: false, message: 'State is required' });
      if (!String(pincode))                return res.status(400).json({ ok: false, message: 'Pincode is required' });
      if (!/^\d{4,8}$/.test(String(pincode).trim())) {
        return res.status(400).json({ ok: false, message: 'Pincode must be between 4-8 digits' });
      }

      // decrement inventory
      for (const item of items) {
        if (item?.id || item?.productId) {
          const productId = item.id || item.productId;
          const product = await Product.findById(productId);
          if (product) {
            if (product.trackInventoryBySize && item.size && Array.isArray(product.sizeInventory)) {
              const idx = product.sizeInventory.findIndex(s => s.code === item.size);
              if (idx !== -1) {
                const have = product.sizeInventory[idx].qty;
                const want = Number(item.qty || 1);
                if (have < want) {
                  return res.status(409).json({
                    ok: false,
                    message: `Insufficient stock for ${product.title} size ${item.size}`,
                    itemId: productId,
                    availableQty: have,
                  });
                }
                product.sizeInventory[idx].qty = have - want;
                await product.save();
              }
            } else if (!product.trackInventoryBySize) {
              const have = product.stock || 0;
              const want = Number(item.qty || 1);
              if (have < want) {
                return res.status(409).json({
                  ok: false,
                  message: `Insufficient stock for ${product.title}`,
                  itemId: productId,
                  availableQty: have,
                });
              }
              product.stock = have - want;
              await product.save();
            }
          }
        }
      }

      const order = new Order({
        userId: req.user._id,
        name: name || req.user.name,
        phone: phone || req.user.phone,
        address: address || req.user.address1,
        city: city || req.user.city,
        state: state || req.user.state,
        pincode: pincode || req.user.pincode,
        paymentMethod: 'Razorpay',
        items,
        total: total || 0,
        status: 'paid',
      });

      await order.save();

      const User = require('../models/User');
      const user = await User.findById(req.user._id);
      if (user?.email) {
        sendOrderConfirmationEmail(order, user).catch(err =>
          console.error('Failed to send confirmation email:', err)
        );
      }

      return res.json({
        ok: true,
        message: 'Payment verified successfully',
        data: { order, razorpayPaymentId, razorpayOrderId },
      });
    }

    return res.json({
      ok: true,
      message: 'Payment verified successfully',
      data: { razorpayPaymentId, razorpayOrderId },
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return res.status(500).json({ ok: false, message: error?.message || 'Payment verification failed' });
  }
});

/* ---------------------------- Manual UPI submit ------------------------- */
router.post('/manual', requireAuth, async (req, res) => {
  try {
    const { transactionId, amount, paymentMethod, items, appliedCoupon, name, phone, address, city, state, pincode } = req.body || {};

    if (!transactionId || !String(transactionId).trim()) {
      return res.status(400).json({ ok: false, message: 'Valid transaction ID is required' });
    }

    const parsedAmount = parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ ok: false, message: 'Valid amount is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, message: 'No items in order' });
    }

    if (!city || !String(city).trim())  return res.status(400).json({ ok: false, message: 'City is required' });
    if (!state || !String(state).trim()) return res.status(400).json({ ok: false, message: 'State is required' });
    if (!String(pincode))                return res.status(400).json({ ok: false, message: 'Pincode is required' });
    if (!/^\d{4,8}$/.test(String(pincode).trim())) {
      return res.status(400).json({ ok: false, message: 'Pincode must be between 4-8 digits' });
    }

    for (const item of items) {
      if (item?.id || item?.productId) {
        const productId = item.id || item.productId;
        const product = await Product.findById(productId);
        if (product) {
          if (product.trackInventoryBySize && item.size && Array.isArray(product.sizeInventory)) {
            const idx = product.sizeInventory.findIndex(s => s.code === item.size);
            if (idx !== -1) {
              const have = product.sizeInventory[idx].qty;
              const want = Number(item.qty || 1);
              if (have < want) {
                return res.status(409).json({
                  ok: false,
                  message: `Insufficient stock for ${product.title} size ${item.size}`,
                  itemId: productId,
                  availableQty: have,
                });
              }
              product.sizeInventory[idx].qty = have - want;
              await product.save();
            }
          } else if (!product.trackInventoryBySize) {
            const have = product.stock || 0;
            const want = Number(item.qty || 1);
            if (have < want) {
              return res.status(409).json({
                ok: false,
                message: `Insufficient stock for ${product.title}`,
                itemId: productId,
                availableQty: have,
              });
            }
            product.stock = have - want;
            await product.save();
          }
        }
      }
    }

    const order = new Order({
      userId: req.user._id,
      name: name || req.user.name,
      phone: phone || req.user.phone,
      address: address || req.user.address1,
      city: city || req.user.city,
      state: state || req.user.state,
      pincode: pincode || req.user.pincode,
      paymentMethod: paymentMethod || 'UPI',
      items,
      total: parsedAmount,
      status: 'pending',
      upi: {
        txnId: String(transactionId).trim(),
        payerName: req.user.name || '',
      },
    });

    await order.save();

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (user?.email) {
      sendOrderConfirmationEmail(order, user).catch(err =>
        console.error('Failed to send confirmation email:', err)
      );
    }

    return res.json({
      ok: true,
      data: order,
      message: 'Order created successfully. Your payment is pending verification.',
    });
  } catch (error) {
    console.error('Manual payment error:', error);
    return res.status(500).json({ ok: false, message: error?.message || 'Failed to process payment' });
  }
});

module.exports = router;
