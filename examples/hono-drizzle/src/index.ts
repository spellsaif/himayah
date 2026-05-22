import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createAuth } from "@himayah/core";
import { createJWTSessionStore } from "@himayah/session";
import { passwordPlugin } from "@himayah/plugin-password";
import { magicLinkPlugin } from "@himayah/plugin-magic-link";
import { otpPlugin } from "@himayah/plugin-otp";
import { organizationPlugin } from "@himayah/plugin-organization";
import { honoMiddleware } from "@himayah/middleware-hono";
import { drizzleAdapter } from "@himayah/adapter-drizzle";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

// Initialize SQLite Database and run DDL setup
const sqlite = new Database("himayah.db");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    email_verified INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS members (
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    joined_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invitations (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_hashes (
    user_id TEXT PRIMARY KEY,
    hash TEXT NOT NULL
  );
`);

const db = drizzle(sqlite, { schema });

// Helper to map schemas for drizzle adapter
const drizzleAdapterSchemas = {
  users: schema.users,
  sessions: schema.sessions,
  accounts: schema.accounts,
  verificationTokens: schema.verificationTokens,
  orgs: schema.orgs,
  members: schema.members,
  invitations: schema.invitations
};

const adapter = drizzleAdapter(db, drizzleAdapterSchemas);

// In-memory developer mailbox to intercept emails (Magic Links, OTPs)
interface MailMessage {
  id: string;
  type: "magic-link" | "otp";
  email: string;
  token: string;
  codeOrUrl: string;
  timestamp: string;
}
const devMailbox: MailMessage[] = [];

// Configure JWTSessionStore
const sessionStore = createJWTSessionStore({
  secret: "super-secret-key-must-be-long-32-chars!!",
  maxAge: 60 * 60 // 1 hour
});

// Build Password hashing storage plugin options
const pPlugin = passwordPlugin({
  getPasswordHash: async (userId) => {
    const row = sqlite.prepare("SELECT hash FROM password_hashes WHERE user_id = ?").get(userId) as { hash: string } | undefined;
    return row?.hash || null;
  },
  setPasswordHash: async (userId, hash) => {
    sqlite.prepare("INSERT OR REPLACE INTO password_hashes (user_id, hash) VALUES (?, ?)").run(userId, hash);
  }
});

// Configure Magic Link plugin
const mlPlugin = magicLinkPlugin({
  sendVerificationToken: async (email, token, url) => {
    devMailbox.unshift({
      id: Math.random().toString(36).substring(7),
      type: "magic-link",
      email,
      token,
      codeOrUrl: url,
      timestamp: new Date().toLocaleTimeString()
    });
    console.log(`[MAILBOX] Magic Link for ${email}: ${url}`);
  },
  rateLimitLimit: 10,
  rateLimitWindow: 60,
  successRedirect: "/"
});

// Configure OTP plugin
const oPlugin = otpPlugin({
  sendOTP: async (identifier, token) => {
    devMailbox.unshift({
      id: Math.random().toString(36).substring(7),
      type: "otp",
      email: identifier,
      token,
      codeOrUrl: token,
      timestamp: new Date().toLocaleTimeString()
    });
    console.log(`[MAILBOX] OTP for ${identifier}: ${token}`);
  },
  rateLimitLimit: 10
});

// Configure Organization Plugin
const orgPlugin = organizationPlugin();

// Create primary Auth instance
const auth = createAuth({
  adapter,
  sessionStore,
  plugins: [pPlugin, mlPlugin, oPlugin, orgPlugin],
  cookieName: "himayah.sid",
  csrf: true // Double-submit cookies enabled!
});

const app = new Hono();

// Dev mailbox routes
app.get("/api/dev/mailbox", (c) => c.json(devMailbox));
app.post("/api/dev/mailbox/clear", (c) => {
  devMailbox.length = 0;
  return c.json({ ok: true });
});

// Inject Himayah Hono Middleware
app.use("*", honoMiddleware(auth));

// Serve visual HTML client
app.get("/", (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Himayah Auth Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 50% 0%, #0d0f1b 0%, #040508 100%);
      --card-bg: rgba(13, 17, 30, 0.7);
      --border-color: rgba(255, 255, 255, 0.08);
      --accent-color: #6366f1;
      --accent-hover: #4f46e5;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg-gradient);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    header {
      padding: 2rem;
      text-align: center;
      border-bottom: 1px solid var(--border-color);
      backdrop-filter: blur(12px);
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 2.2rem;
      background: linear-gradient(135deg, #a78bfa 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 700;
    }

    .logo-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
    }

    .logo-subtitle {
      font-size: 0.8rem;
      color: var(--text-muted);
      border: 1px solid var(--border-color);
      padding: 0.1rem 0.5rem;
      border-radius: 9999px;
    }

    .app-container {
      flex: 1;
      display: grid;
      grid-template-columns: 350px 1fr 350px;
      gap: 1.5rem;
      padding: 2rem;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
    }

    @media (max-width: 1024px) {
      .app-container {
        grid-template-columns: 1fr;
      }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 1.2rem;
      transition: transform 0.2s, border-color 0.2s;
    }

    .card:hover {
      border-color: rgba(99, 102, 241, 0.3);
    }

    .card-title {
      font-size: 1.2rem;
      font-weight: 600;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    label {
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--text-muted);
    }

    input, select {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.75rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.95rem;
      transition: all 0.2s;
    }

    input:focus, select:focus {
      outline: none;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }

    button {
      background: var(--accent-color);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
    }

    button:hover {
      background: var(--accent-hover);
    }

    button:active {
      transform: scale(0.98);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      color: var(--text-main);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .btn-danger {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--danger);
    }
    .btn-danger:hover {
      background: var(--danger);
      color: white;
    }

    .auth-tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
      background: rgba(0, 0, 0, 0.2);
      padding: 0.25rem;
      border-radius: 8px;
    }

    .tab-btn {
      padding: 0.5rem;
      font-size: 0.8rem;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted);
    }

    .tab-btn.active {
      background: var(--accent-color);
      color: white;
    }

    .json-explorer {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      background: rgba(0, 0, 0, 0.4);
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      white-space: pre-wrap;
      max-height: 400px;
      border: 1px solid var(--border-color);
    }

    .mail-item {
      border: 1px solid var(--border-color);
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .mail-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .mail-badge {
      background: var(--accent-color);
      color: white;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: bold;
    }

    .mail-body {
      font-size: 0.85rem;
      word-break: break-all;
    }

    .mail-link {
      display: inline-block;
      margin-top: 0.5rem;
      color: #818cf8;
      text-decoration: underline;
      cursor: pointer;
    }

    .status-badge {
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .status-badge.success { background: rgba(16, 185, 129, 0.15); color: var(--success); }
    .status-badge.danger { background: rgba(239, 68, 68, 0.15); color: var(--danger); }

    .org-pill {
      font-size: 0.8rem;
      background: rgba(245, 158, 11, 0.15);
      color: var(--warning);
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-container">
      <span class="logo-icon">هيمية</span>
      <span class="logo-title">Himayah</span>
      <span class="logo-subtitle">Hono & Drizzle</span>
    </div>
    <div id="session-header-status">
      <span class="status-badge danger">No Active Session</span>
    </div>
  </header>

  <main class="app-container">
    <!-- Left Column: Authenticate -->
    <div class="card" id="auth-panel">
      <div class="card-title">Authenticate</div>
      <div class="auth-tabs">
        <button class="tab-btn active" onclick="switchAuthTab('password')">Password</button>
        <button class="tab-btn" onclick="switchAuthTab('magic-link')">Magic Link</button>
        <button class="tab-btn" onclick="switchAuthTab('otp')">OTP</button>
      </div>

      <!-- Password Auth View -->
      <div id="auth-password-form" class="auth-tab-view" style="display: flex; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="password-email" placeholder="you@example.com" value="test@example.com">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="password-pass" placeholder="••••••••" value="securepassword123">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <button onclick="handlePasswordAuth('/api/auth/password/signUp')">Sign Up</button>
          <button class="btn-secondary" onclick="handlePasswordAuth('/api/auth/password/signIn')">Sign In</button>
        </div>
      </div>

      <!-- Magic Link Auth View -->
      <div id="auth-magic-link-form" class="auth-tab-view" style="display: none; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="magic-link-email" placeholder="you@example.com">
        </div>
        <button onclick="handleMagicLinkRequest()">Send Magic Link</button>
      </div>

      <!-- OTP Auth View -->
      <div id="auth-otp-form" class="auth-tab-view" style="display: none; flex-direction: column; gap: 1rem;">
        <div class="form-group">
          <label>Email or Phone</label>
          <input type="text" id="otp-identifier" placeholder="user-identifier">
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 0.5rem;" id="otp-request-container">
          <button onclick="handleOTPRequest()">Generate & Send OTP</button>
        </div>
        <div id="otp-verify-container" style="display: none; flex-direction: column; gap: 1rem;">
          <div class="form-group">
            <label>Verification Code (OTP)</label>
            <input type="text" id="otp-code" placeholder="123456">
          </div>
          <button class="btn-secondary" onclick="handleOTPVerify()">Verify OTP</button>
        </div>
      </div>
    </div>

    <!-- Middle Column: Session & Organizations (Visible when logged in) -->
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Active Session Status Explorer -->
      <div class="card">
        <div class="card-title">
          Active Session Data
          <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="refreshSession()">Refresh</button>
        </div>
        <div class="json-explorer" id="session-explorer">Loading session context...</div>
        <div id="session-actions" style="display: none; justify-content: flex-end;">
          <button class="btn-danger" style="padding: 0.5rem 1rem; font-size: 0.85rem;" onclick="handleSignOut()">Sign Out</button>
        </div>
      </div>

      <!-- Organizations Panel -->
      <div class="card" id="org-panel" style="display: none;">
        <div class="card-title">
          Organizations
          <span class="org-pill" id="active-org-pill">None Active</span>
        </div>

        <!-- Create Organization -->
        <div class="form-group">
          <label>Create New Organization</label>
          <div style="display: flex; gap: 0.5rem;">
            <input type="text" id="org-name" placeholder="Acme Inc" style="flex: 1;">
            <button onclick="handleCreateOrg()">Create</button>
          </div>
        </div>

        <!-- Switch Active Org -->
        <div class="form-group" id="switch-org-container" style="display: none;">
          <label>Switch Active Organization</label>
          <div style="display: flex; gap: 0.5rem;">
            <select id="org-select" style="flex: 1;"></select>
            <button class="btn-secondary" onclick="handleSwitchOrg()">Switch</button>
          </div>
        </div>

        <!-- Invite Member -->
        <div class="form-group" id="invite-member-container" style="display: none; border-top: 1px solid var(--border-color); padding-top: 1rem;">
          <label>Invite Member to Active Org</label>
          <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
            <input type="email" id="invite-email" placeholder="colleague@example.com">
            <select id="invite-role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button onclick="handleInviteMember()">Send Invitation</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Dev Mailbox -->
    <div class="card">
      <div class="card-title">
        Dev Mailbox (Interceptor)
        <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.8rem;" onclick="clearMailbox()">Clear</button>
      </div>
      <p style="font-size: 0.8rem; color: var(--text-muted);">
        Verification links & OTP codes are intercepted here instead of sending real emails.
      </p>
      <div id="mailbox-list" style="display: flex; flex-direction: column; gap: 0.8rem; overflow-y: auto; max-height: 500px;">
        <span style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 0;">Mailbox empty</span>
      </div>
    </div>
  </main>

  <script>
    let activeSession = null;

    // Read cookie utility
    function getCookie(name) {
      const value = '; ' + document.cookie;
      const parts = value.split('; ' + name + '=');
      if (parts.length === 2) return parts.pop().split(';').shift();
    }

    // Standard client API fetch with automated CSRF injection
    async function apiFetch(url, options = {}) {
      const headers = options.headers || {};
      if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
      }

      // Add double submit CSRF token to header
      const csrfToken = getCookie("himayah.csrf");
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }

      const res = await fetch(url, {
        ...options,
        headers
      });
      return res;
    }

    function switchAuthTab(tabId) {
      document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".auth-tab-view").forEach(view => view.style.display = "none");
      
      event.target.classList.add("active");
      document.getElementById("auth-" + tabId + "-form").style.display = "flex";
    }

    async function handlePasswordAuth(url) {
      const email = document.getElementById("password-email").value;
      const password = document.getElementById("password-pass").value;

      try {
        const res = await apiFetch(url, {
          method: "POST",
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.ok) {
          alert("Success!");
          await refreshSession();
        } else {
          alert("Error: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        console.error(err);
        alert("Request failed.");
      }
    }

    async function handleMagicLinkRequest() {
      const email = document.getElementById("magic-link-email").value;
      try {
        const res = await apiFetch("/api/auth/magic-link/send", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.ok) {
          alert("Magic link sent! Check the Developer Mailbox on the right.");
          startMailboxPolling();
        } else {
          alert("Error: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    let activeOtpIdentifier = "";
    async function handleOTPRequest() {
      const identifier = document.getElementById("otp-identifier").value;
      try {
        const res = await apiFetch("/api/auth/otp/send", {
          method: "POST",
          body: JSON.stringify({ identifier })
        });
        const data = await res.json();
        if (data.ok) {
          activeOtpIdentifier = identifier;
          document.getElementById("otp-request-container").style.display = "none";
          document.getElementById("otp-verify-container").style.display = "flex";
          alert("OTP Code generated! Check the Developer Mailbox on the right.");
          startMailboxPolling();
        } else {
          alert("Error: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    async function handleOTPVerify() {
      const code = document.getElementById("otp-code").value;
      try {
        const res = await apiFetch("/api/auth/otp/verify", {
          method: "POST",
          body: JSON.stringify({ identifier: activeOtpIdentifier, token: code })
        });
        const data = await res.json();
        if (data.ok) {
          alert("OTP verification successful!");
          document.getElementById("otp-code").value = "";
          document.getElementById("otp-request-container").style.display = "flex";
          document.getElementById("otp-verify-container").style.display = "none";
          await refreshSession();
        } else {
          alert("Error: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    async function handleSignOut() {
      try {
        await apiFetch("/api/auth/signOut", { method: "POST" });
        alert("Signed out!");
        await refreshSession();
      } catch (err) {
        alert("Sign out failed.");
      }
    }

    async function handleCreateOrg() {
      const name = document.getElementById("org-name").value;
      if (!name) return alert("Enter organization name");
      try {
        const res = await apiFetch("/api/auth/org/create", {
          method: "POST",
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById("org-name").value = "";
          alert("Organization created!");
          await refreshSession();
        } else {
          alert("Error: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Create org failed.");
      }
    }

    async function handleSwitchOrg() {
      const orgId = document.getElementById("org-select").value;
      if (!orgId) return;
      try {
        const res = await apiFetch("/api/auth/org/switch", {
          method: "POST",
          body: JSON.stringify({ orgId })
        });
        const data = await res.json();
        if (data.ok) {
          alert("Switched organization context!");
          await refreshSession();
        } else {
          alert("Switch failed: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    async function handleInviteMember() {
      const email = document.getElementById("invite-email").value;
      const role = document.getElementById("invite-role").value;
      if (!email) return alert("Enter email to invite");
      try {
        const res = await apiFetch("/api/auth/org/invite", {
          method: "POST",
          body: JSON.stringify({ orgId: activeSession.activeOrgId, email, role })
        });
        const data = await res.json();
        if (data.ok) {
          document.getElementById("invite-email").value = "";
          alert("Invitation created! Intercepted in developer mailbox.");
          startMailboxPolling();
        } else {
          alert("Invite failed: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    async function acceptInvitation(token) {
      try {
        const res = await apiFetch("/api/auth/org/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.ok) {
          alert("Invitation accepted successfully!");
          await refreshSession();
        } else {
          alert("Accept failed: " + (data.error?.message || data.error?.code));
        }
      } catch (err) {
        alert("Request failed.");
      }
    }

    async function refreshSession() {
      try {
        const res = await apiFetch("/api/auth/session");
        if (res.status === 200) {
          const data = await res.json();
          if (data.ok) {
            activeSession = data.data;
            document.getElementById("session-header-status").innerHTML = '<span class="status-badge success">Active Session</span>';
            document.getElementById("session-explorer").textContent = JSON.stringify(activeSession, null, 2);
            document.getElementById("session-actions").style.display = "flex";
            document.getElementById("auth-panel").style.display = "none";
            document.getElementById("org-panel").style.display = "flex";
            
            // Populate Org info
            if (activeSession.activeOrgId) {
              document.getElementById("active-org-pill").textContent = "Active: " + activeSession.activeOrgId;
              document.getElementById("invite-member-container").style.display = "flex";
            } else {
              document.getElementById("active-org-pill").textContent = "No Org Selected";
              document.getElementById("invite-member-container").style.display = "none";
            }

            // Populate Org switcher
            if (activeSession.userOrgs && activeSession.userOrgs.length > 0) {
              const select = document.getElementById("org-select");
              select.innerHTML = activeSession.userOrgs.map(o => 
                \`<option value="\${o.id}" \${o.id === activeSession.activeOrgId ? 'selected' : ''}>\${o.name}</option>\`
              ).join('');
              document.getElementById("switch-org-container").style.display = "block";
            } else {
              document.getElementById("switch-org-container").style.display = "none";
            }
            return;
          }
        }
      } catch (err) {
        console.error(err);
      }
      activeSession = null;
      document.getElementById("session-header-status").innerHTML = '<span class="status-badge danger">No Active Session</span>';
      document.getElementById("session-explorer").textContent = "No active session cookies matching 'himayah.sid' detected.";
      document.getElementById("session-actions").style.display = "none";
      document.getElementById("auth-panel").style.display = "flex";
      document.getElementById("org-panel").style.display = "none";
    }

    async function fetchMailbox() {
      try {
        const res = await fetch("/api/dev/mailbox");
        const list = await res.json();
        const container = document.getElementById("mailbox-list");
        if (list.length === 0) {
          container.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 2rem 0;">Mailbox empty</span>';
          return;
        }

        container.innerHTML = list.map(mail => {
          if (mail.type === 'magic-link') {
            return \`
              <div class="mail-item">
                <div class="mail-header">
                  <span>To: \${mail.email}</span>
                  <span class="mail-badge">Magic Link</span>
                </div>
                <div class="mail-body">
                  Click the link below to verify and sign in:
                  <span class="mail-link" onclick="window.location.href='\${mail.codeOrUrl}'">Login Link &rarr;</span>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">\${mail.timestamp}</div>
              </div>
            \`;
          } else if (mail.codeOrUrl.length > 50) {
            // Probably organization invitation link (magic-link style)
            return \`
              <div class="mail-item">
                <div class="mail-header">
                  <span>To: \${mail.email}</span>
                  <span class="mail-badge">Org Invitation</span>
                </div>
                <div class="mail-body">
                  You are invited to join an organization. Click to accept:
                  <span class="mail-link" onclick="acceptInvitation('\${mail.token}')">Accept & Join &rarr;</span>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">\${mail.timestamp}</div>
              </div>
            \`;
          } else {
            return \`
              <div class="mail-item">
                <div class="mail-header">
                  <span>To: \${mail.email}</span>
                  <span class="mail-badge">OTP Code</span>
                </div>
                <div class="mail-body" style="font-family: 'JetBrains Mono', monospace; font-size: 1.1rem; color: var(--success); font-weight: bold; text-align: center;">
                  \${mail.codeOrUrl}
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-align: right;">\${mail.timestamp}</div>
              </div>
            \`;
          }
        }).join('');
      } catch (err) {
        console.error(err);
      }
    }

    async function clearMailbox() {
      await fetch("/api/dev/mailbox/clear", { method: "POST" });
      await fetchMailbox();
    }

    let mailboxInterval = null;
    function startMailboxPolling() {
      if (mailboxInterval) clearInterval(mailboxInterval);
      fetchMailbox();
      mailboxInterval = setInterval(fetchMailbox, 3000);
    }

    // Startup initialization
    window.addEventListener("load", () => {
      refreshSession();
      startMailboxPolling();
    });
  </script>
</body>
</html>
  `);
});

// Run server on port 3000
const port = 3000;
console.log(`[Hono Server] Running on http://localhost:${port}`);
serve({
  fetch: app.fetch,
  port
});
