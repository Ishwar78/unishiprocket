const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getTrackingDetails, getShipmentTrack } = require('../utils/shiprocketService');

// GET /api/tracking/:trackingNumber - Get tracking details for any tracking number (public)
router.get('/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    if (!trackingNumber || trackingNumber.trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'Tracking number is required' });
    }

    const trackingDetails = await getTrackingDetails(trackingNumber.trim());

    return res.json({ ok: true, data: trackingDetails });
  } catch (error) {
    console.error('Tracking error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to fetch tracking details' });
  }
});

// GET /api/tracking/order/:orderId - Get tracking for a specific order (user can see own order)
router.get('/order/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findById(orderId).lean();

    if (!order) {
      return res.status(404).json({ ok: false, message: 'Order not found' });
    }

    // Check if user owns this order (or is admin)
    const isOwner = String(order.userId) === String(userId);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ ok: false, message: 'Unauthorized' });
    }

    if (!order.trackingNumber) {
      return res.json({
        ok: true,
        data: {
          orderId: String(order._id),
          status: order.status,
          trackingNumber: null,
          message: 'Tracking number not yet assigned',
        },
      });
    }

    const trackingDetails = await getTrackingDetails(order.trackingNumber);

    return res.json({
      ok: true,
      data: {
        orderId: String(order._id),
        orderStatus: order.status,
        ...trackingDetails,
      },
    });
  } catch (error) {
    console.error('Order tracking error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to fetch order tracking' });
  }
});

// GET /api/tracking/search - Search orders by phone (public)
router.get('/search/phone/:phone', async (req, res) => {
  try {
    const { phone } = req.params;

    if (!phone || phone.trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'Phone number is required' });
    }

    // Find orders in our database with this phone
    const orders = await Order.find(
      { phone: phone.trim() },
      { _id: 1, name: 1, phone: 1, status: 1, trackingNumber: 1, createdAt: 1 }
    )
      .lean()
      .sort({ createdAt: -1 });

    if (orders.length === 0) {
      return res.json({ ok: true, data: [] });
    }

    // Get tracking details for each order with tracking number
    const ordersWithTracking = await Promise.all(
      orders.map(async (order) => {
        if (!order.trackingNumber) {
          return {
            orderId: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            trackingNumber: null,
            createdAt: order.createdAt,
          };
        }

        try {
          const trackingDetails = await getTrackingDetails(order.trackingNumber);
          return {
            orderId: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            tracking: trackingDetails,
            createdAt: order.createdAt,
          };
        } catch {
          return {
            orderId: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            trackingNumber: order.trackingNumber,
            createdAt: order.createdAt,
          };
        }
      })
    );

    return res.json({ ok: true, data: ordersWithTracking });
  } catch (error) {
    console.error('Search tracking error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to search orders' });
  }
});

// GET /api/tracking/admin/all - Get all orders with tracking (admin only)
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const status = req.query.status ? String(req.query.status).toLowerCase() : '';

    let query = {};
    if (status && ['pending', 'paid', 'shipped', 'delivered', 'returned', 'cancelled'].includes(status)) {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .select('_id name phone status trackingNumber createdAt updatedAt total')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const ordersWithTracking = await Promise.all(
      orders.map(async (order) => {
        if (!order.trackingNumber) {
          return {
            id: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            trackingNumber: null,
            tracking: null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            total: order.total,
          };
        }

        try {
          const trackingDetails = await getTrackingDetails(order.trackingNumber);
          return {
            id: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            trackingNumber: order.trackingNumber,
            tracking: trackingDetails,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            total: order.total,
          };
        } catch {
          return {
            id: String(order._id),
            name: order.name,
            phone: order.phone,
            status: order.status,
            trackingNumber: order.trackingNumber,
            tracking: null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            total: order.total,
          };
        }
      })
    );

    return res.json({
      ok: true,
      data: {
        orders: ordersWithTracking,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Admin tracking error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/tracking/admin/stats - Get tracking statistics (admin only)
router.get('/admin/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const shippedOrders = await Order.countDocuments({ status: { $in: ['shipped', 'delivered'] } });
    const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const ordersWithTracking = await Order.countDocuments({ trackingNumber: { $exists: true, $ne: '' } });

    return res.json({
      ok: true,
      data: {
        totalOrders,
        shippedOrders,
        deliveredOrders,
        pendingOrders,
        ordersWithTracking,
        trackingPercentage: totalOrders > 0 ? Math.round((ordersWithTracking / totalOrders) * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to fetch stats' });
  }
});

module.exports = router;
