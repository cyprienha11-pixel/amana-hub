const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PI_API_BASE = "https://api.minepi.com/v2";
const PI_API_KEY = process.env.PI_API_KEY;

// Health check
app.get("/", (req, res) => {
  res.json({
    app: "AMANA HUB",
    status: "Backend is running",
    message: "Connect • Trade • Earn"
  });
});

// Verify Pi user
app.get("/api/auth/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Authorization token is required"
      });
    }

    const response = await fetch(`${PI_API_BASE}/me`, {
      headers: {
        Authorization: authHeader
      }
    });

    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Approve Pi payment
app.post("/api/payments/approve", async (req, res) => {
  try {
    if (!PI_API_KEY) {
      return res.status(500).json({
        error: "PI_API_KEY is not configured on the server"
      });
    }

    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({
        error: "paymentId is required"
      });
    }

    const response = await fetch(
      `${PI_API_BASE}/payments/${paymentId}/approve`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${PI_API_KEY}`
        }
      }
    );

    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

// Complete Pi payment
app.post("/api/payments/complete", async (req, res) => {
  try {
    if (!PI_API_KEY) {
      return res.status(500).json({
        error: "PI_API_KEY is not configured on the server"
      });
    }

    const { paymentId, txid } = req.body;

    if (!paymentId || !txid) {
      return res.status(400).json({
        error: "paymentId and txid are required"
      });
    }

    const response = await fetch(
      `${PI_API_BASE}/payments/${paymentId}/complete`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${PI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          txid: txid
        })
      }
    );

    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`AMANA HUB backend running on port ${PORT}`);
});
