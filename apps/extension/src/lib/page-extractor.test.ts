import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeBrowserCommand, extractProductPage } from "./page-extractor";

describe("page extractor", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "";
  });

  it("extracts Amazon-style product signals", () => {
    document.title = "Amazon product";
    document.body.innerHTML = `
      <div id="wayfinding-breadcrumbs_container"><a>Electronics</a><a>Headphones</a></div>
      <span id="productTitle">boAt Airdopes 141 Bluetooth TWS Earbuds</span>
      <div id="corePrice_desktop">
        <span class="a-price"><span class="a-offscreen">₹1,299</span></span>
        <span class="a-text-price"><span class="a-offscreen">₹4,490</span></span>
      </div>
      <span class="savingsPercentage">71% off</span>
      <span id="acrPopover"><span class="a-icon-alt">4.0 out of 5 stars</span></span>
      <span id="acrCustomerReviewText">184,236 ratings</span>
      <div id="sellerProfileTriggerId">Appario Retail Private Ltd</div>
      <div id="availability">In stock</div>
      <div id="mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE">Tomorrow by 10 PM</div>
      <div id="RETURNS_POLICY">7 days service centre replacement</div>
      <img src="https://images.example.test/item.jpg" />
    `;

    const page = extractProductPage(document, "https://www.amazon.in/example/dp/B000000");

    expect(page.merchant).toBe("amazon");
    expect(page.title).toContain("boAt Airdopes");
    expect(page.price?.amount).toBe(1299);
    expect(page.mrp?.amount).toBe(4490);
    expect(page.rating).toBe(4);
    expect(page.reviewCount).toBe(184236);
    expect(page.seller).toBe("Appario Retail Private Ltd");
    expect(page.breadcrumbs).toEqual(["Electronics", "Headphones"]);
  });

  it("extracts Flipkart-style product signals", () => {
    document.body.innerHTML = `
      <h1><span class="VU-ZEz">Samsung Galaxy M-series Phone</span></h1>
      <div class="Nx9bqj">₹14,999</div>
      <div class="yRaY8j">₹19,999</div>
      <div class="UkUFwK">25% off</div>
      <div class="XQDdHH">4.3</div>
      <span class="Wphh3N">12,345 ratings</span>
      <div class="hVvnXm">Delivery by Friday</div>
      <div class="_7dPnhA"><a>Mobiles</a><a>Samsung</a></div>
    `;

    const page = extractProductPage(document, "https://www.flipkart.com/example/p/itm123");

    expect(page.merchant).toBe("flipkart");
    expect(page.price?.amount).toBe(14999);
    expect(page.mrp?.amount).toBe(19999);
    expect(page.rating).toBe(4.3);
    expect(page.reviewCount).toBe(12345);
    expect(page.delivery).toBe("Delivery by Friday");
  });

  it("extracts Myntra-style product signals", () => {
    document.body.innerHTML = `
      <div class="breadcrumbs"><a>Men</a><a>Shoes</a></div>
      <h1 class="pdp-title">Roadster</h1>
      <h1 class="pdp-name">Men Black Sneakers</h1>
      <span class="pdp-price"><strong>₹1,349</strong></span>
      <span class="pdp-mrp">MRP ₹2,999</span>
      <span class="pdp-discount">(55% OFF)</span>
      <div class="index-overallRating">4.1 | 9.2k Ratings</div>
      <div class="pincode-serviceabilityContainer">Delivery by 14 Jun</div>
      <div class="pdp-returnPolicy">14 days return available</div>
      <button class="size-buttons-size-button-selected">UK 9</button>
      <img src="https://assets.myntassets.com/item.jpg" />
    `;

    const page = extractProductPage(document, "https://www.myntra.com/shoes/roadster/example/123/buy");

    expect(page.merchant).toBe("myntra");
    expect(page.title).toBe("Roadster Men Black Sneakers");
    expect(page.price?.amount).toBe(1349);
    expect(page.mrp?.amount).toBe(2999);
    expect(page.rating).toBe(4.1);
    expect(page.reviewCount).toBe(9200);
    expect(page.selectedSize).toBe("UK 9");
    expect(page.breadcrumbs).toEqual(["Men", "Shoes"]);
  });
});

describe("browser command execution", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks an approved add-to-cart control", () => {
    const clickHandler = vi.fn();
    document.body.innerHTML = `<button aria-label="Add to cart">Add to cart</button>`;
    document.querySelector("button")?.addEventListener("click", clickHandler);

    const result = executeBrowserCommand(document, {
      command: "click_add_to_cart",
      selector: null,
      url: null,
      message: "Approved.",
    });

    expect(result.ok).toBe(true);
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("uses site-specific selectors before generic text matching", () => {
    const clickHandler = vi.fn();
    document.body.innerHTML = `<input id="add-to-cart-button" type="submit" value="Cart" />`;
    document.querySelector("input")?.addEventListener("click", clickHandler);

    const result = executeBrowserCommand(
      document,
      {
        command: "click_add_to_cart",
        selector: null,
        url: null,
        message: "Approved.",
      },
      { url: "https://www.amazon.in/example/dp/B000000" },
    );

    expect(result.ok).toBe(true);
    expect(clickHandler).toHaveBeenCalledTimes(1);
  });

  it("opens comparison URLs through an injected opener", () => {
    const openUrl = vi.fn();
    const result = executeBrowserCommand(
      document,
      {
        command: "open_url",
        selector: null,
        url: "https://www.google.com/search?q=headphones",
        message: "Opening comparison.",
      },
      { openUrl },
    );

    expect(result.ok).toBe(true);
    expect(openUrl).toHaveBeenCalledWith("https://www.google.com/search?q=headphones");
  });

  it("fails closed when the target action is not visible", () => {
    document.body.innerHTML = `<button>Buy now</button>`;

    const result = executeBrowserCommand(document, {
      command: "click_add_to_cart",
      selector: null,
      url: null,
      message: "Approved.",
    });

    expect(result.ok).toBe(false);
  });
});
