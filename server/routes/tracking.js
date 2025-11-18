const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/admin/orders/stats - Get order statistics (admin only)
router.get('/admin/orders/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const total = await Order.countDocuments();
    const pending = await Order.countDocuments({ status: 'pending' });
    const paid = await Order.countDocuments({ status: 'paid' });
    const shipped = await Order.countDocuments({ status: 'shipped' });
    const delivered = await Order.countDocuments({ status: 'delivered' });
    const returned = await Order.countDocuments({ status: 'returned' });
    const cancelled = await Order.countDocuments({ status: 'cancelled' });

    return res.json({
      ok: true,
      data: {
        total,
        pending,
        paid,
        shipped,
        delivered,
        returned,
        cancelled,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return res.status(500).json({ ok: false, message: 'Failed to fetch stats' });
  }
});

module.exports = router;
