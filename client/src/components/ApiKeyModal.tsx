import React, { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Shield,
  ExternalLink,
  Lock,
  Sparkles,
  X,
} from "lucide-react";
import {
  getStoredKeys,
  saveStoredKeys,
  clearStoredKeys,
  hasCustomRazorpayKeys,
  ClientApiKeys,
} from "../utils/keyStore";
import { verifyApiKeys } from "../api/client";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChanged?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onKeysChanged,
}) => {
  const [keys, setKeys] = useState<ClientApiKeys>({
    keyId: "",
    keySecret: "",
    webhookSecret: "",
    geminiApiKey: "",
  });

  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);

  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    type: "idle" | "success" | "error";
    message: string;
    mode?: string;
  }>({ type: "idle", message: "" });

  const [hasCustom, setHasCustom] = useState<boolean>(false);

  // Sync with current stored keys on open
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredKeys();
      setKeys(stored);
      setHasCustom(hasCustomRazorpayKeys());
      setVerifyStatus({ type: "idle", message: "" });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!keys.keyId.trim() || !keys.keySecret.trim()) {
      setVerifyStatus({
        type: "error",
        message: "Please enter both Razorpay Key ID and Key Secret to test connection.",
      });
      return;
    }

    setIsVerifying(true);
    setVerifyStatus({ type: "idle", message: "" });

    try {
      const res = await verifyApiKeys(keys);
      if (res.valid) {
        setVerifyStatus({
          type: "success",
          message:
            res.message ||
            `Successfully authenticated with Razorpay ${res.mode?.toUpperCase() || "TEST"} API!`,
          mode: res.mode,
        });
      } else {
        setVerifyStatus({
          type: "error",
          message: res.error || "Authentication failed with Razorpay API.",
        });
      }
    } catch (err: any) {
      setVerifyStatus({
        type: "error",
        message: err.message || "Network error while validating keys.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    saveStoredKeys(keys);
    setHasCustom(hasCustomRazorpayKeys());
    onKeysChanged?.();
    onClose();
  };

  const handleClear = () => {
    clearStoredKeys();
    setKeys({
      keyId: "",
      keySecret: "",
      webhookSecret: "",
      geminiApiKey: "",
    });
    setHasCustom(false);
    setVerifyStatus({
      type: "idle",
      message: "Reset to built-in Sandbox Simulator mode.",
    });
    onKeysChanged?.();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 12,
          maxWidth: "540px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
          color: "#f3f4f6",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #1f2937",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "linear-gradient(135deg, #0D94FB 0%, #0284C7 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
              }}
            >
              <Key size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                Bring Your Own Keys (BYOK)
              </h2>
              <p style={{ fontSize: "0.78rem", color: "#9ca3af", margin: 0 }}>
                Test against your Razorpay account directly in the browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#9ca3af",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Current Status Pill */}
          <div
            style={{
              padding: "0.75rem 1rem",
              borderRadius: 8,
              background: hasCustom
                ? "rgba(16, 185, 129, 0.12)"
                : "rgba(59, 130, 246, 0.12)",
              border: `1px solid ${
                hasCustom ? "rgba(16, 185, 129, 0.3)" : "rgba(59, 130, 246, 0.3)"
              }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              {hasCustom ? (
                <CheckCircle2 size={16} color="#10b981" />
              ) : (
                <Shield size={16} color="#3b82f6" />
              )}
              <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
                {hasCustom ? "Custom Razorpay Keys Active" : "Built-in Sandbox Simulator Active"}
              </span>
            </div>
            {hasCustom && (
              <span
                style={{
                  fontSize: "0.72rem",
                  padding: "0.2rem 0.5rem",
                  borderRadius: 4,
                  background: "#065f46",
                  color: "#a7f3d0",
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {keys.keyId.startsWith("rzp_live") ? "LIVE" : "TEST"}
              </span>
            )}
          </div>

          {/* Form Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {/* Razorpay Key ID */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#d1d5db" }}>
                  Razorpay Key ID
                </label>
                <a
                  href="https://dashboard.razorpay.com/#/access/api_keys"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: "0.72rem",
                    color: "#38bdf8",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.2rem",
                    textDecoration: "none",
                  }}
                >
                  Dashboard Keys <ExternalLink size={10} />
                </a>
              </div>
              <input
                type="text"
                placeholder="rzp_test_..."
                value={keys.keyId}
                onChange={(e) => setKeys({ ...keys, keyId: e.target.value })}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "0.55rem 0.75rem",
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: 6,
                  color: "#ffffff",
                  fontSize: "0.84rem",
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
            </div>

            {/* Razorpay Key Secret */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#d1d5db",
                  marginBottom: "0.35rem",
                }}
              >
                Razorpay Key Secret
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showSecret ? "text" : "password"}
                  placeholder="Enter Razorpay Key Secret"
                  value={keys.keySecret}
                  onChange={(e) => setKeys({ ...keys, keySecret: e.target.value })}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 2.25rem 0.55rem 0.75rem",
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontSize: "0.84rem",
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  style={{
                    position: "absolute",
                    right: "0.6rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Webhook Secret (Optional) */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#d1d5db",
                  marginBottom: "0.35rem",
                }}
              >
                Webhook Secret <span style={{ color: "#6b7280", fontWeight: 400 }}>(Optional)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showWebhookSecret ? "text" : "password"}
                  placeholder="Used to verify incoming X-Razorpay-Signature"
                  value={keys.webhookSecret || ""}
                  onChange={(e) => setKeys({ ...keys, webhookSecret: e.target.value })}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 2.25rem 0.55rem 0.75rem",
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontSize: "0.84rem",
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                  style={{
                    position: "absolute",
                    right: "0.6rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showWebhookSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Gemini API Key (Optional) */}
            <div>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#d1d5db",
                  marginBottom: "0.35rem",
                }}
              >
                <Sparkles size={13} color="#a855f7" />
                Gemini API Key <span style={{ color: "#6b7280", fontWeight: 400 }}>(Optional for LLM Reasoning)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showGeminiKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  value={keys.geminiApiKey || ""}
                  onChange={(e) => setKeys({ ...keys, geminiApiKey: e.target.value })}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "0.55rem 2.25rem 0.55rem 0.75rem",
                    backgroundColor: "#1f2937",
                    border: "1px solid #374151",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontSize: "0.84rem",
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  style={{
                    position: "absolute",
                    right: "0.6rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    color: "#9ca3af",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                  }}
                >
                  {showGeminiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* Test Status Banner */}
          {verifyStatus.type !== "idle" && (
            <div
              style={{
                padding: "0.65rem 0.85rem",
                borderRadius: 6,
                background:
                  verifyStatus.type === "success"
                    ? "rgba(16, 185, 129, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                border: `1px solid ${
                  verifyStatus.type === "success"
                    ? "rgba(16, 185, 129, 0.4)"
                    : "rgba(239, 68, 68, 0.4)"
                }`,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.8rem",
                color: verifyStatus.type === "success" ? "#a7f3d0" : "#fca5a5",
              }}
            >
              {verifyStatus.type === "success" ? (
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              ) : (
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
              )}
              <span>{verifyStatus.message}</span>
            </div>
          )}

          {/* Privacy & Simulator Notice Card */}
          <div
            style={{
              padding: "0.75rem",
              borderRadius: 6,
              background: "#1e293b",
              border: "1px solid #334155",
              fontSize: "0.74rem",
              color: "#cbd5e1",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 700, color: "#38bdf8" }}>
              <Lock size={12} />
              <span>Zero Server Persistence Guarantee</span>
            </div>
            <p style={{ margin: 0, lineHeight: 1.4 }}>
              Keys are strictly stored in your browser's local storage and sent via encrypted request headers. They are NEVER persisted on the server or logged.
            </p>
            <p style={{ margin: 0, color: "#94a3b8" }}>
              💡 Built-in simulation VPAs: <strong style={{ color: "#a7f3d0" }}>success@razorpay</strong> (Auto-Capture) & <strong style={{ color: "#fca5a5" }}>failure@razorpay</strong> (Bank Decline).
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #1f2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={handleTestConnection}
              disabled={isVerifying || !keys.keyId || !keys.keySecret}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 0.8rem",
                borderRadius: 6,
                background: "#374151",
                border: "1px solid #4b5563",
                color: "#f3f4f6",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: !keys.keyId || !keys.keySecret ? "not-allowed" : "pointer",
                opacity: !keys.keyId || !keys.keySecret ? 0.5 : 1,
              }}
            >
              <RefreshCw size={13} className={isVerifying ? "pulse-animation" : ""} />
              <span>{isVerifying ? "Testing..." : "Test Connection"}</span>
            </button>

            {hasCustom && (
              <button
                onClick={handleClear}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.45rem 0.8rem",
                  borderRadius: 6,
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  color: "#fca5a5",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                title="Clear custom keys and use default sandbox simulator"
              >
                <Trash2 size={13} />
                <span>Reset to Sandbox</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={onClose}
              style={{
                padding: "0.45rem 0.85rem",
                borderRadius: 6,
                background: "transparent",
                border: "1px solid #374151",
                color: "#9ca3af",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: 6,
                background: "linear-gradient(135deg, #0D94FB 0%, #0284C7 100%)",
                border: "none",
                color: "#ffffff",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(13, 148, 251, 0.3)",
              }}
            >
              Save & Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
