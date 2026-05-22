import { collectImages, collectTexts, firstMeta, firstText } from "./dom";
import type { SiteAdapter } from "./types";

export const genericAdapter: SiteAdapter = {
  merchant: "generic",
  matches: () => true,
  extract: ({ doc, titleFallback }) => ({
    title: firstText(doc, ["h1", "[data-testid*=title]", "[class*=title]"]) || firstMeta(doc, ["og:title", "title"]) || titleFallback,
    priceText: firstMeta(doc, ["product:price:amount", "price", "og:price:amount"]) || firstText(doc, ["[class*=price]", "[data-testid*=price]"]),
    mrpText: firstText(doc, ["[class*=mrp]", "[class*=list-price]", "[class*=strike]"]),
    discountText: firstText(doc, ["[class*=discount]", "[class*=saving]"]),
    ratingText: firstText(doc, ["[class*=rating]", "[aria-label*=rating]"]),
    reviewText: firstText(doc, ["[class*=review]", "[class*=ratings]"]),
    seller: firstText(doc, ["[class*=seller]", "[class*=merchant]"]),
    availability: firstText(doc, ["[class*=availability]", "[class*=stock]"]),
    delivery: firstText(doc, ["[class*=delivery]", "[class*=shipping]"]),
    returnPolicy: firstText(doc, ["[class*=return]", "[class*=refund]"]),
    selectedSize: firstText(doc, ["[class*=selected]", "[aria-selected='true']"]),
    images: collectImages(doc),
    breadcrumbs: collectTexts(doc, [".breadcrumbs a", "[aria-label*=breadcrumb] a"]),
  }),
  actions: {
    addToCart: {
      selectors: ["button[name*=cart]", "[data-testid*=cart]", "[class*=cart] button"],
      textNeedles: ["add to cart", "add to bag", "add item"],
    },
    wishlist: {
      selectors: ["button[name*=wishlist]", "[data-testid*=wishlist]", "[class*=wishlist] button"],
      textNeedles: ["wishlist", "wish list", "save for later"],
    },
  },
};
