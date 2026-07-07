import { Router } from "express";
import { fetchMarketNews } from "../lib/freeNews";

const router = Router();

router.get("/market/news", async (req, res) => {
  const { tickers, limit } = req.query as { tickers?: string; limit?: string };

  try {
    const news = await fetchMarketNews({
      tickers,
      limit: limit ? Number(limit) : undefined,
    });
    return res.json(news);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch market news");
    return res.status(500).json({ error: "Failed to fetch market news" });
  }
});

export default router;
