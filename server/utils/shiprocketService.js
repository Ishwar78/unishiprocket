const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1';
let cachedToken = null;
let tokenExpiry = null;

async function getAuthToken() {
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    const response = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: process.env.SHIPROCKET_API_EMAIL,
        password: process.env.SHIPROCKET_API_PASSWORD,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'Auth failed');
    }

    const data = await response.json();
    cachedToken = data.token;
    tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

    return cachedToken;
  } catch (error) {
    console.error('Shiprocket auth error:', error.message);
    throw new Error('Failed to authenticate with Shiprocket');
  }
}

async function getTrackingDetails(trackingNumber) {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${SHIPROCKET_BASE_URL}/courier/track/number/${trackingNumber}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return {
        trackingNumber,
        status: 'not_found',
        message: 'Tracking information not available',
      };
    }

    const data = await response.json();

    if (data && data.tracking_data) {
      const tracking = data.tracking_data;
      return {
        trackingNumber,
        status: tracking.shipment_status || 'unknown',
        currentLocation: tracking.current_location || 'unknown',
        lastUpdate: tracking.last_updated || null,
        events: tracking.track_events || [],
        estimatedDelivery: tracking.estimated_delivery_date || null,
        carrier: tracking.courier_name || 'Shiprocket',
      };
    }

    return {
      trackingNumber,
      status: 'not_found',
      message: 'Tracking information not available',
    };
  } catch (error) {
    console.error('Shiprocket tracking error:', error.message);
    throw new Error('Failed to fetch tracking details from Shiprocket');
  }
}

async function searchOrdersByPhone(phone) {
  try {
    const token = await getAuthToken();

    const url = new URL(`${SHIPROCKET_BASE_URL}/orders/search`);
    url.searchParams.set('search_type', 'mobile_number');
    url.searchParams.set('search_value', phone);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Shiprocket search error:', error.message);
    return [];
  }
}

async function getShipmentTrack(shipmentId) {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${SHIPROCKET_BASE_URL}/shipments/track/shipment/${shipmentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data && data.track_shipments && data.track_shipments.length > 0) {
      const shipment = data.track_shipments[0];
      return {
        shipmentId,
        orderId: shipment.order_id,
        trackingNumber: shipment.track_id,
        status: shipment.shipment_status,
        carrier: shipment.courier_company_name,
        currentLocation: shipment.current_location,
        estimatedDelivery: shipment.estimated_delivery,
        events: shipment.track_events || [],
        lastUpdate: shipment.last_updated,
      };
    }

    return null;
  } catch (error) {
    console.error('Shiprocket shipment track error:', error.message);
    throw new Error('Failed to fetch shipment tracking');
  }
}

async function getAreaWiseCharges(pincode) {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${SHIPROCKET_BASE_URL}/settings/warehouse/serviceability`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        pickup_postcode: process.env.SHIPROCKET_PICKUP_PINCODE || '110001',
        delivery_postcode: String(pincode),
        weight: 0.5,
        cod: 1,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('Shiprocket serviceability check failed:', error);
      return {
        available: false,
        charges: 0,
        message: 'Service not available for this area',
      };
    }

    const data = await response.json();

    if (data.status === 200 && data.data && data.data.length > 0) {
      const serviceOption = data.data[0];
      return {
        pincode,
        available: true,
        charges: Number(serviceOption.rate || 0),
        serviceName: serviceOption.name || 'Standard',
        deliveryDays: Number(serviceOption.delivery_days || 0),
        courierCompany: serviceOption.courier_name || 'Shiprocket',
      };
    }

    return {
      available: false,
      charges: 0,
      message: 'Service not available for this area',
    };
  } catch (error) {
    console.error('Shiprocket area charges error:', error.message);
    return {
      available: false,
      charges: 0,
      message: 'Failed to fetch shipping charges',
    };
  }
}

module.exports = {
  getAuthToken,
  getTrackingDetails,
  searchOrdersByPhone,
  getShipmentTrack,
  getAreaWiseCharges,
};
