const express = require('express');
const router = express.Router();
const { getAreaWiseCharges } = require('../utils/shiprocketService');

// Get area-wise shipping charges
router.post('/charges', async (req, res) => {
  try {
    const { pincode } = req.body || {};

    if (!pincode) {
      return res.status(400).json({
        ok: false,
        message: 'Pincode is required',
      });
    }

    const charges = await getAreaWiseCharges(String(pincode).trim());

    return res.json({
      ok: true,
      data: charges,
    });
  } catch (error) {
    console.error('Shipping charges error:', error.message);
    return res.status(500).json({
      ok: false,
      message: 'Failed to fetch shipping charges',
    });
  }
});

module.exports = router;
