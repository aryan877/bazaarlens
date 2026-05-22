import {
  arrayValue,
  collectImages,
  collectTexts,
  firstJsonAssignment,
  firstMeta,
  firstText,
  imageValues,
  objectValue,
  textValue,
  unique,
} from "./dom";
import type { SiteAdapter } from "./types";

export const myntraAdapter: SiteAdapter = {
  merchant: "myntra",
  matches: (hostname) => hostname.includes("myntra."),
  extract: ({ doc, titleFallback }) => {
    const pdp = objectValue(firstJsonAssignment(doc, "window.__myx =")?.pdpData);
    const brand = objectValue(pdp?.brand);
    const ratings = objectValue(pdp?.ratings);
    const flags = objectValue(pdp?.flags);
    const serviceability = objectValue(pdp?.serviceability);
    const price = objectValue(pdp?.price);

    return {
      title:
        [firstText(doc, [".pdp-title"]), firstText(doc, [".pdp-name"])].filter(Boolean).join(" ") ||
        withBrand(textValue(brand?.name), textValue(pdp?.name)) ||
        firstMeta(doc, ["og:title"]) ||
        titleFallback,
      priceText:
        firstText(doc, [".pdp-price strong", ".pdp-discount-container .pdp-price", ".pdp-price"]) ||
        rupees(price?.discountedPrice ?? price?.discounted ?? pdp?.discountedPrice ?? pdp?.mrp),
      mrpText: firstText(doc, [".pdp-mrp"]) || rupees(price?.mrp ?? pdp?.mrp),
      discountText: firstText(doc, [".pdp-discount", ".pdp-discount-container"]) || textValue(price?.discountLabel),
      ratingText: firstText(doc, [".index-overallRating", ".pdp-ratings"]) || textValue(ratings?.averageRating),
      reviewText:
        firstText(doc, [".dQlvJf", ".pdp-ratings-count", ".index-overallRating", "[class*=review]"]) ||
        textValue(ratings?.totalCount),
      seller: firstText(doc, [".seller-name", "[class*=seller]"]) || sellerName(pdp),
      availability: firstText(doc, [".pdp-stock", "[class*=availability]"]) || stockText(flags),
      delivery: firstText(doc, [".pdp-deliveryOptions", ".pincode-serviceabilityContainer"]) || serviceabilityText(serviceability),
      returnPolicy: firstText(doc, [".pdp-returnPolicy", ".meta-info"]) || returnPolicyText(serviceability),
      selectedSize: firstText(doc, [".size-buttons-size-button-selected", ".size-buttons-size-button"]),
      images: unique([...myntraImages(pdp), ...collectImages(doc, [".image-grid-image", ".image-grid-imageContainer img", "img"])]),
      breadcrumbs: collectTexts(doc, [".breadcrumbs a"]),
    };
  },
  actions: {
    addToCart: {
      selectors: [".pdp-add-to-bag", "button.pdp-add-to-bag", "[class*='add-to-bag']"],
      textNeedles: ["add to bag", "add to cart"],
    },
    wishlist: {
      selectors: [".pdp-add-to-wishlist", "[class*='wishlist']"],
      textNeedles: ["wishlist", "wish list"],
    },
  },
};

function rupees(value: unknown): string | null {
  const text = textValue(value);
  return text ? `₹${text}` : null;
}

function withBrand(brand: string | null, name: string | null): string | null {
  if (!name) return null;
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name;
  return `${brand} ${name}`;
}

function sellerName(pdp: Record<string, unknown> | null): string | null {
  const seller = objectValue(arrayValue(pdp?.sellers)[0]);
  return textValue(seller?.displayName) || textValue(seller?.sellerName);
}

function stockText(flags: Record<string, unknown> | null): string | null {
  if (!flags || typeof flags.outOfStock !== "boolean") return null;
  return flags.outOfStock ? "Out of stock" : "In stock";
}

function serviceabilityText(serviceability: Record<string, unknown> | null): string | null {
  const descriptors = arrayValue(serviceability?.descriptors)
    .map(textValue)
    .filter((value): value is string => Boolean(value));
  return descriptors[0] ?? null;
}

function returnPolicyText(serviceability: Record<string, unknown> | null): string | null {
  const returnPeriod = textValue(serviceability?.returnPeriod);
  if (returnPeriod) return `Easy ${returnPeriod} days returns and exchanges`;
  return serviceabilityText(serviceability);
}

function myntraImages(pdp: Record<string, unknown> | null): string[] {
  const media = objectValue(pdp?.media);
  return unique(
    arrayValue(media?.albums).flatMap((album) =>
      arrayValue(objectValue(album)?.images).flatMap((image) => {
        const imageObject = objectValue(image);
        return imageValues(imageObject?.imageURL ?? imageObject?.secureSrc ?? imageObject?.src);
      }),
    ),
  );
}
