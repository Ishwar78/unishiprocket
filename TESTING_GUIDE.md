# Testing Guide: Shiprocket Area-Wise Charges & Landmark Feature

## Features Implemented

### 1. Shiprocket Area-Wise Charges (Automatic)
- **Backend**: New endpoint `/api/shipping/charges` fetches charges based on pincode
- **Frontend**: CheckoutPayment automatically fetches charges when pincode is entered
- **Display**: Shipping charges shown in payment summary
- **Calculation**: Total = Subtotal - Discount + Shipping

### 2. Landmark Field
- **Order Model**: Added `landmark` field (optional string)
- **Checkout**: New landmark input field below pincode
- **Order Creation**: Landmark included in all order creation methods (COD, Razorpay, UPI)
- **Display**: Landmark shown in order tracking, order success, and admin pages

---

## Test Cases

### Test 1: Checkout Form - Landmark Field
**Steps:**
1. Navigate to `/checkout`
2. Fill delivery details (name, phone, address, city, state, pincode)
3. Verify landmark input field appears below pincode
4. Enter a landmark (e.g., "Near Market, Opposite Park")
5. Verify landmark is optional (no error if left empty)

**Expected Result:** ✓ Landmark field is visible and editable

---

### Test 2: Shipping Charges Automatic Fetch
**Steps:**
1. On checkout page, enter a valid pincode (e.g., 110001, 560001, 400001)
2. Wait 1-2 seconds for API call
3. Check payment summary section
4. Verify shipping charges appear and update the total

**Expected Result:** ✓ Shipping charges fetch automatically and display in payment summary

---

### Test 3: Shipping Charges Calculation in Total
**Steps:**
1. Note subtotal amount
2. Enter pincode and wait for shipping charges to fetch
3. Verify: **Total = Subtotal - Discount (if any) + Shipping Charges**
4. Try with different pincodes and verify charges update

**Expected Result:** ✓ Total amount correctly includes shipping charges

---

### Test 4: COD Order with Landmark
**Steps:**
1. Add items to cart
2. Go to checkout
3. Fill all delivery details including landmark
4. Select "Cash on Delivery" payment method
5. Click "Place COD Order"
6. Verify order is created

**Expected Result:** ✓ Order created with landmark data stored in database

---

### Test 5: Order Success Page - Landmark Display
**Steps:**
1. After placing an order, view the order success page
2. In "Delivery Address" section, verify landmark is displayed
3. If no landmark was entered, it should not appear

**Expected Result:** ✓ Landmark displays in order success page when provided

---

### Test 6: Track Order - Landmark Display (Phone Number Search)
**Steps:**
1. Navigate to Track Order page
2. Select "By Phone Number" tab
3. Enter phone number of your order
4. Click "Search Orders"
5. Find your order and check if landmark is displayed

**Expected Result:** ✓ Landmark appears in order tracking results

---

### Test 7: Admin - Order Details with Landmark
**Steps:**
1. Login as admin (uni10@gmail.com / 12345678)
2. Go to Admin → Orders
3. Click on any order to view details
4. Check the "Shipping" section in the drawer
5. Verify landmark appears in shipping details

**Expected Result:** ✓ Landmark displays in admin order details panel

---

### Test 8: Razorpay Payment with Landmark & Shipping
**Steps:**
1. Add items to cart
2. Go to checkout
3. Fill delivery details with landmark
4. Select "Pay with Razorpay"
5. Complete payment (test mode)
6. View order details after payment
7. Verify landmark and shipping charges are saved

**Expected Result:** ✓ Landmark and shipping charges included in Razorpay orders

---

### Test 9: UPI Manual Payment with Landmark & Shipping
**Steps:**
1. Add items to cart
2. Go to checkout
3. Fill delivery details with landmark
4. Note the total amount (includes shipping)
5. Select UPI payment tab (if available)
6. Submit transaction ID
7. Verify order is created with landmark and shipping

**Expected Result:** ✓ Landmark and shipping charges included in UPI orders

---

### Test 10: No Landmark Impact on Orders
**Steps:**
1. Create order without entering landmark (leave empty)
2. View order details in success page or admin
3. Verify order functions normally without landmark

**Expected Result:** ✓ Orders work fine without landmark (it's optional)

---

### Test 11: Invalid/No Shipping for Pincode
**Steps:**
1. Enter an invalid or remote pincode that Shiprocket doesn't service
2. Verify shipping charges show as 0
3. Verify total calculation is still correct (subtotal - discount + 0)

**Expected Result:** ✓ System handles unavailable areas gracefully

---

### Test 12: Multiple Orders with Different Landmarks
**Steps:**
1. Create multiple orders with different landmarks
2. View each order
3. Verify each order shows its correct landmark

**Expected Result:** ✓ Landmarks are correctly associated with their respective orders

---

## API Endpoint Testing

### Test Shipping Charges Endpoint
```bash
# Test the shipping charges API
curl -X POST http://localhost:5055/api/shipping/charges \
  -H "Content-Type: application/json" \
  -d '{"pincode": "110001"}'

# Expected Response:
{
  "ok": true,
  "data": {
    "pincode": "110001",
    "available": true,
    "charges": 50,
    "serviceName": "Standard",
    "deliveryDays": 3,
    "courierCompany": "Shiprocket"
  }
}
```

---

## Database Verification

### Check Order in MongoDB
```javascript
// In MongoDB shell or Compass
db.orders.findOne({
  _id: ObjectId("your_order_id")
})

// Expected to see fields:
// - landmark: "Your Landmark"
// - shipping: 50 (or appropriate charge)
// - total: (subtotal - discount + shipping)
```

---

## Files Modified

### Backend
- `server/models/Order.js` - Added landmark field
- `server/utils/shiprocketService.js` - Added getAreaWiseCharges method
- `server/routes/shipping.js` - New endpoint for shipping charges
- `server/routes/orders.js` - Updated to handle landmark in POST
- `server/routes/payment.js` - Updated to include landmark and shipping in orders
- `server/routes/admin.js` - Updated order detail to include landmark
- `server/index.js` - Registered shipping routes

### Frontend
- `src/pages/CheckoutPayment.tsx` - Added landmark field and shipping charge fetch
- `src/pages/TrackOrder.tsx` - Display landmark in order results
- `src/pages/MyOrders.tsx` - Added landmark to Order interface
- `src/pages/OrderSuccess.tsx` - Display landmark in delivery address section
- `src/pages/Admin.tsx` - Display landmark in order detail drawer

---

## Summary Checklist

- [ ] Landmark field appears in checkout form
- [ ] Landmark is optional (no required field validation)
- [ ] Shipping charges auto-fetch based on pincode
- [ ] Shipping charges display in payment summary
- [ ] Total calculation includes shipping charges
- [ ] COD orders save landmark
- [ ] Razorpay orders save landmark
- [ ] UPI orders save landmark
- [ ] Landmark displays in order success page
- [ ] Landmark displays in order tracking
- [ ] Landmark displays in admin order details
- [ ] Orders work without landmark (it's optional)
- [ ] Multiple orders have separate landmarks
- [ ] Invalid pincodes handled gracefully
- [ ] Shipping API endpoint working
- [ ] Database stores landmark correctly

---

## Notes

- Shipping charges are fetched from Shiprocket API based on pincode
- If Shiprocket service is unavailable, charges default to 0
- Landmark is stored in Order model but not required
- All existing order functionality remains unchanged
- Backward compatibility maintained for orders without landmark
