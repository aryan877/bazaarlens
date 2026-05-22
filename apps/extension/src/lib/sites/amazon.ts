import { collectImages, collectTexts, firstMeta, firstText } from "./dom";
import type { SiteAdapter } from "./types";

export const amazonAdapter: SiteAdapter = {
  merchant: "amazon",
  matches: (hostname) => hostname.includes("amazon."),
  extract: ({ doc, titleFallback }) => ({
    title: firstText(doc, ["#productTitle", "#title", "h1"]) || firstMeta(doc, ["og:title"]) || titleFallback,
    priceText: firstText(doc, [
      "#corePrice_desktop .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-offscreen",
      "#apex_desktop .a-offscreen",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
      "#priceblock_saleprice",
    ]),
    mrpText: firstText(doc, [
      "#corePrice_desktop .a-text-price .a-offscreen",
      "#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen",
      "#price .a-text-strike",
      ".basisPrice .a-offscreen",
      "#listPrice",
    ]),
    discountText: firstText(doc, [".savingsPercentage", ".reinventPriceSavingsPercentageMargin", "[class*=savings]"]),
    ratingText: firstText(doc, ["[data-hook='average-star-rating'] .a-icon-alt", "#acrPopover .a-icon-alt"]),
    reviewText: firstText(doc, ["#acrCustomerReviewText", "[data-hook='total-review-count']"]),
    seller: firstText(doc, ["#sellerProfileTriggerId", "#merchant-info", "#bylineInfo"]),
    availability: firstText(doc, ["#availability", "#availabilityInsideBuyBox_feature_div"]),
    delivery: firstText(doc, [
      "#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE",
      "#deliveryBlockMessage",
      "#ddmDeliveryMessage",
    ]),
    returnPolicy: firstText(doc, ["#RETURNS_POLICY", "#icon-farm-container", "[data-name='RETURNS_POLICY']"]),
    selectedSize: firstText(doc, [
      "#native_dropdown_selected_size_name option:checked",
      "#variation_size_name .selection",
      "#inline-twister-expanded-dimension-text-size_name",
    ]),
    images: collectImages(doc, ["#imgTagWrapperId img", "#landingImage", "#altImages img", "img"]),
    breadcrumbs: collectTexts(doc, ["#wayfinding-breadcrumbs_container a", "#nav-subnav a"]),
  }),
  actions: {
    addToCart: {
      selectors: ["#add-to-cart-button", "#submit.add-to-cart", "input[name='submit.add-to-cart']"],
      textNeedles: ["add to cart", "add item"],
    },
    wishlist: {
      selectors: ["#add-to-wishlist-button-submit", "input[name='submit.add-to-registry.wishlist']"],
      textNeedles: ["add to wish list", "wishlist", "save for later"],
    },
  },
};
