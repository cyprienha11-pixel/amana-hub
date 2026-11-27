const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PI_API_BASE = "https://api.minepi.com/v2";
const PI_API_KEY = process.env.PI_API_KEY;

// NEON DATABASE CONNECTION
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5
});

// Health check
app.get("/", (req, res) => {
  res.json({
    app: "AMANA HUB",
    status: "Backend is running",
    message: "Connect • Trade • Earn"
  });
});

// Test database connection
app.get("/api/db/status", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS database_time"
    );

    res.json({
      app: "AMANA HUB",
      database: "Connected",
      time: result.rows[0].database_time
    });
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.status(500).json({
      database: "Connection failed"
    });
  }
});
// VERIFY PI USER
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
// VERIFY AMANA HUB ADMIN
async function verifyAdmin(req, res) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: "Pi authentication required"
      });
      return false;
    }

    const piResponse = await fetch(`${PI_API_BASE}/me`, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!piResponse.ok) {
      res.status(401).json({
        error: "Invalid Pi authentication"
      });
      return false;
    }

    const piUser = await piResponse.json();

    if (
      !process.env.ADMIN_PI_UID ||
      piUser.uid !== process.env.ADMIN_PI_UID
    ) {
      res.status(403).json({
        error: "Admin access denied"
      });
      return false;
    }

    return true;

  } catch (error) {
    res.status(500).json({
      error: "Admin verification failed"
    });
    return false;
  }
}

// GET AGENT APPLICATIONS - ADMIN ONLY
app.get("/api/admin/agents/applications", async (req, res) => {
  try {
    const isAdmin = await verifyAdmin(req, res);

    if (!isAdmin) return;

    const result = await pool.query(
      `SELECT
        id,
        pi_username,
        name,
        phone,
        location,
        product,
        experience,
        status,
        application_date,
        created_at
      FROM agent_applications
      ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      applications: result.rows
    });

  } catch (error) {
    console.error("Admin applications error:", error.message);

    res.status(500).json({
      error: "Failed to retrieve applications"
    });
  }
});

// SUBMIT AGENT APPLICATION
app.post("/api/agents/applications", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Pi authentication required"
      });
    }

    const piResponse = await fetch(`${PI_API_BASE}/me`, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!piResponse.ok) {
      return res.status(401).json({
        error: "Invalid Pi authentication"
      });
    }

    const piUser = await piResponse.json();

    if (!piUser.uid || !piUser.username) {
      return res.status(401).json({
        error: "Pi user verification failed"
      });
    }

    const {
      name,
      phone,
      location,
      product,
      experience
    } = req.body;

    if (!name || !phone || !location) {
      return res.status(400).json({
        error: "Name, phone and location are required"
      });
    }

    const applicationId = "APP-" + Date.now();

    const result = await pool.query(
      `INSERT INTO agent_applications
      (
        id,
        pi_user_id,
        pi_username,
        name,
        phone,
        location,
        product,
        experience,
        status,
        application_date
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9)
      RETURNING id, status, created_at`,
      [
        applicationId,
        piUser.uid,
        piUser.username,
        name.trim(),
        phone.trim(),
        location.trim(),
        product || "",
        experience || "",
        new Date().toISOString()
      ]
    );

    res.status(201).json({
      success: true,
      message: "Agent application submitted successfully",
      application: result.rows[0]
    });

  } catch (error) {
    console.error("Agent application error:", error.message);

    res.status(500).json({
      error: "Failed to submit agent application"
    });
  }
});
// APPROVE OR REJECT AGENT APPLICATION - ADMIN ONLY
app.patch("/api/admin/agents/applications/:id/status", async (req, res) => {
  try {
    const isAdmin = await verifyAdmin(req, res);

    if (!isAdmin) return;

    const applicationId = req.params.id;
    const { status } = req.body;

    if (!["APPROVED", "REJECTED"].includes(status)) {
      return res.status(400).json({
        error: "Status must be APPROVED or REJECTED"
      });
    }

    const result = await pool.query(
      `UPDATE agent_applications
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, applicationId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Agent application not found"
      });
    }

    res.json({
      success: true,
      message: "Agent application status updated successfully",
      application: result.rows[0]
    });

  } catch (error) {
    console.error("Agent status update error:", error.message);

    res.status(500).json({
      error: "Failed to update agent application status"
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
