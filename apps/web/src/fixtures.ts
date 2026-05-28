import type { AnalyzeRequest } from "@bazaarlens/shared";

export const demoAnalyzeRequest: AnalyzeRequest = {
  page: {
    url: "https://www.amazon.in/example/dp/B000000",
    merchant: "amazon",
    title: "boAt Airdopes 141 Bluetooth TWS Earbuds",
    price: { amount: 1299, currency: "INR", raw: "₹1,299" },
    mrp: { amount: 4490, currency: "INR", raw: "₹4,490" },
    discountText: "71% off",
    rating: 4.0,
    reviewCount: 184236,
    seller: "Appario Retail Private Ltd",
    availability: "In stock",
    delivery: "Tomorrow by 10 PM",
    returnPolicy: "7 days service centre replacement",
    selectedSize: null,
    images: [],
    breadcrumbs: ["Electronics", "Headphones", "True Wireless"],
    visibleText:
      "In stock. 7 days service centre replacement. Seller Appario Retail Private Ltd. Bluetooth earbuds with 42 hours playback.",
    extractedAt: new Date().toISOString(),
  },
  intent: {
    query: "Should I buy this under ₹1,500?",
    budget: 1500,
    userContext: "I care about return policy and seller trust.",
  },
};
