require("dotenv").config();
const express = require("express");
const Razorpay = require("razorpay");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); // Serve index.html

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Check if environment variables are loaded
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error(
    "ERROR: Razorpay credentials not found in environment variables"
  );
  console.error("Please check your .env file");
  process.exit(1);
}

app.post("/create-order", async (req, res) => {
  // Additional validation for live payments
  if (
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_ID.startsWith("rzp_live_")
  ) {
    console.log(
      "⚠️  WARNING: Using LIVE Razorpay credentials - Real money will be charged!"
    );
  }

  const { amount, sevaType, sevaItem } = req.body;

  // Validate the amount
  if (!amount || amount < 1) {
    return res.status(400).json({
      error: "Invalid amount",
      message: "Amount must be greater than 0",
    });
  }

  // Create a shorter receipt ID (max 40 chars)
  const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
  const sevaCode = sevaType
    ? sevaType.slice(0, 8).replace(/\s+/g, "")
    : "general"; // First 8 chars, no spaces
  const receipt = `seva_${sevaCode}_${timestamp}`.slice(0, 40); // Ensure max 40 chars

  const options = {
    amount: amount * 100, // Convert to paise
    currency: "INR",
    receipt: receipt,
    payment_capture: 1, // Auto capture payments
    notes: {
      seva_type: sevaType || "general",
      seva_item: sevaItem || "donation",
    },
  };

  try {
    console.log("Creating order with options:", options);
    const order = await razorpay.orders.create(options);
    console.log("Order created successfully:", order.id);

    res.json({
      key: process.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      amount: order.amount,
      seva_type: sevaType,
      seva_item: sevaItem,
    });
  } catch (err) {
    console.error("Error creating order:", err);
    res.status(500).json({
      error: "Error creating order",
      message: err.message,
    });
  }
});

// Payment verification endpoint
app.post("/verify-payment", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  try {
    // Verify payment signature
    const crypto = require("crypto");
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      console.log("Payment verified successfully");
      res.json({
        success: true,
        message: "Payment verified successfully",
      });
    } else {
      console.log("Payment verification failed");
      res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }
  } catch (err) {
    console.error("Error verifying payment:", err);
    res.status(500).json({
      success: false,
      message: "Error verifying payment",
    });
  }
});

const PORT = process.env.PORT || 3000;

// For local development
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
