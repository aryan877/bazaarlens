import {
  collectImages,
  collectTexts,
  firstJsonLdProduct,
  firstMeta,
  firstText,
  imageValues,
  productOffer,
  productRating,
  textValue,
  unique,
} from "./dom";
import type { SiteAdapter } from "./types";

export const flipkartAdapter: SiteAdapter = {
  merchant: "flipkart",
  matches: (hostname) => hostname.includes("flipkart."),
  extract: ({ doc, titleFallback }) => {
    const product = firstJsonLdProduct(doc);
    const offer = productOffer(product);
    const rating = productRating(product);

    return {
      title:
        firstText(doc, ["span.VU-ZEz", "h1 span", "h1", ".B_NuCI"]) ||
        textValue(product?.name) ||
        firstMeta(doc, ["og:title"]) ||
        titleFallback,
      priceText: firstText(doc, [".Nx9bqj", "._30jeq3", "._16Jk6d", "[class*='price']"]) || rupees(offer?.price),
      mrpText: firstText(doc, [".yRaY8j", "._3I9_wc", "._2p6lqe"]),
      discountText: firstText(doc, [".UkUFwK", "._3Ay6Sb", "[class*='discount']"]),
      ratingText: firstText(doc, [".XQDdHH", "._3LWZlK", "[class*='rating']"]) || textValue(rating?.ratingValue),
      reviewText:
        firstText(doc, [".Wphh3N", "._2_R_DZ", ".row._2afbiS", "[class*='review']"]) ||
        textValue(rating?.ratingCount) ||
        textValue(rating?.reviewCount),
      seller: firstText(doc, ["#sellerName", ".seller-name", "[class*='seller']"]),
      availability: firstText(doc, ["._16FRp0", "[class*='availability']", "[class*='stock']"]) || availability(offer?.availability),
      delivery: firstText(doc, [".hVvnXm", "._1TPvTK", "[class*='delivery']", "[class*='Delivery']"]),
      returnPolicy:
        firstText(doc, [".YhUgfO", "[class*='return']", "[class*='Return']"]) ||
        returnPolicyText(offer?.hasMerchantReturnPolicy),
      selectedSize: firstText(doc, [".dpZEpc", "[class*='selected']", "[class*='Selected']"]),
      images: unique([...imageValues(product?.image), ...collectImages(doc, ["._0DkuPH img", "._2r_T1I img", ".CXW8mj img", "img"])]),
      breadcrumbs: collectTexts(doc, ["._7dPnhA a", "._1MR4o5 a", ".breadcrumb a"]),
    };
  },
  actions: {
    addToCart: {
      selectors: ["button._2KpZ6l._2U9uOA._3v1-ww", "button._2KpZ6l", "button[class*='cart']", "form button"],
      textNeedles: ["add to cart", "add item"],
    },
    wishlist: {
      selectors: ["._36FSn5", "[class*='wishlist']", "[aria-label*='Wishlist']"],
      textNeedles: ["wishlist", "add to wishlist", "save"],
    },
  },
};

function rupees(value: unknown): string | null {
  const text = textValue(value);
  return text ? `₹${text}` : null;
}

function availability(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;
  if (text.toLowerCase().includes("instock")) return "In stock";
  if (text.toLowerCase().includes("outofstock")) return "Out of stock";
  return text;
}

function returnPolicyText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return textValue((value as Record<string, unknown>).description);
}
