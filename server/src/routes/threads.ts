import { Router } from "express";
import { ThreadStore } from "../thread/threadStore.js";

const router = Router();

// GET all threads
router.get("/", (_req, res) => {
  try {
    const threads = ThreadStore.getAllThreads();
    res.json({ success: true, threads });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET full envelope list for one thread
router.get("/:id", (req, res) => {
  try {
    const threadId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const messages = ThreadStore.getThread(threadId);
    res.json({
      success: true,
      thread_id: threadId,
      messages,
      count: messages.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE a specific thread
router.delete("/:id", (req, res) => {
  try {
    const threadId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    ThreadStore.clearThread(threadId);
    res.json({ success: true, message: `Thread ${threadId} cleared.` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE all threads
router.delete("/", (_req, res) => {
  try {
    ThreadStore.clearAll();
    res.json({ success: true, message: "All threads cleared." });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
