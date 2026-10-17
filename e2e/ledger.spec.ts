import { expect, test, type Page } from "@playwright/test";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD } from "../src/lib/roster";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who owns how much of the plot" })).toHaveCount(0);
  await expect(page.getByTestId("collected-total")).toBeVisible();
}

/** Records a payment for the signed-in person: there is no "who paid" picker any more. */
async function payForMyself(page: Page, firstName: string, amount: string, date: string, note: string) {
  await page.getByTestId("add-payment").click();
  const flow = page.getByTestId("pay-flow");
  await expect(flow.getByTestId("pay-as")).toContainText(`You (${firstName})`);
  // the overlay must cover the screen (regression: it once rendered below the page)
  await expect(flow.getByTestId("pay-as")).toBeInViewport();
  await expect(flow.getByRole("heading", { name: "Who paid?" })).toHaveCount(0);
  await expect(flow.locator('[data-testid^="pay-person-"]')).toHaveCount(0);
  for (const char of amount.replace(/,/g, "")) {
    await flow.getByTestId(char === "." ? "key-dot" : `key-${char}`).click();
  }
  await expect(flow.getByTestId("pay-amount")).toContainText(`₹${amount}`);
  await flow.getByLabel("Date").fill(date);
  await flow.getByLabel("Note").fill(note);
  const slider = flow.getByRole("slider", { name: `slide to pay ₹${amount}` });
  await expect(slider).toBeVisible();
  await slider.press("Enter");
  await expect(flow.getByTestId("payment-done")).toContainText(`₹${amount}`);
  await flow.getByTestId("payment-done").click();
  await expect(page.getByTestId("pay-flow")).toHaveCount(0);
}

test("everyone pays only for themselves and sees everyone's shares", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);
  await expect(adminPage.getByTestId("share-ananya")).toContainText("0.00%");

  // the admin is linked to Ananya and can only record Ananya's money
  await payForMyself(adminPage, "Ananya", "25,00,000", "2026-04-11", "Twenty-five lakh");
  await expect(adminPage.getByTestId("share-ananya")).toContainText("100.00%");
  await expect(adminPage.getByTestId("share-ananya")).toContainText("₹25,00,000 paid");
  await expect(adminPage.getByText(/Land split|sq ft/)).toHaveCount(0);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD);
  await expect(memberPage.getByTestId("share-ananya")).toContainText("100.00%");
  await payForMyself(memberPage, "Rohan", "75,00,000", "2026-05-02", "Rest of the contributor pool");
  await expect(memberPage.getByTestId("share-rohan")).toContainText("75.00%");
  await expect(memberPage.getByTestId("share-rohan")).toContainText("You");
  await expect(memberPage.getByTestId("share-ananya")).toContainText("25.00%");

  // the admin's screen updates live
  await expect(adminPage.getByTestId("share-rohan")).toContainText("75.00%");
  await expect(adminPage.getByTestId("collected-total")).toContainText("₹1,00,00,000");
  await expect(adminPage.getByTestId("ownership-pool")).toContainText("₹1,00,00,000");

  // history: everyone reads every payment, but only edits their own (within 24h)
  await memberPage.getByTestId("nav-history").click();
  await expect(memberPage).toHaveURL(/\/history\/?$/);
  await expect(memberPage.getByTestId("history-list")).toContainText("Twenty-five lakh");
  await expect(memberPage.getByTestId("history-list")).toContainText("Rest of the contributor pool");
  await expect(memberPage.getByRole("button", { name: "Edit" })).toHaveCount(1);
  await expect(memberPage.getByText(/Editable for \d+h more/)).toHaveCount(1);

  await adminPage.getByTestId("nav-history").click();
  await expect(adminPage.getByTestId("audit-list")).toContainText("Ananya Iyer");
  await expect(adminPage.getByTestId("audit-list")).toContainText("Rohan Mehta");
  await expect(adminPage.getByRole("button", { name: "Edit" })).toHaveCount(1);

  await memberContext.close();
  await adminContext.close();
});

test("a new account can't see the ledger until the admin links it", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Need an account? Create one" }).click();
  await page.getByLabel("Name").fill("Newcomer");
  await page.getByLabel("Email").fill(`new-${Date.now()}@plotshare.local`);
  await page.getByLabel("Password").fill("newcomer-pass-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("needs-link")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask the admin to link your account" })).toBeVisible();
  await expect(page.getByTestId("collected-total")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
});

/** Dispatches a one-finger touch drag (Chromium supports Touch objects with hasTouch). */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await page.evaluate(
    async ({ from, to, steps }) => {
      const target = document.elementFromPoint(from.x, from.y) ?? document.body;
      const touchAt = (x: number, y: number) =>
        new Touch({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y + window.scrollY });
      const fire = (type: string, x: number, y: number, active: boolean) => {
        const touch = touchAt(x, y);
        target.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: active ? [touch] : [],
            targetTouches: active ? [touch] : [],
            changedTouches: [touch],
          }),
        );
      };
      fire("touchstart", from.x, from.y, true);
      for (let step = 1; step <= steps; step += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        fire("touchmove", from.x + ((to.x - from.x) * step) / steps, from.y + ((to.y - from.y) * step) / steps, true);
      }
      fire("touchend", to.x, to.y, false);
    },
    { from, to, steps },
  );
}

test("swipe between tabs and pull down to pay", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 412, height: 900 } });
  const page = await context.newPage();
  await signIn(page, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD);

  // swipe left on the ledger → People; swipe right twice → History
  await touchDrag(page, { x: 330, y: 420 }, { x: 60, y: 430 });
  await expect(page).toHaveURL(/\/people\/?$/);
  await expect(page.getByTestId("nav-people")).toHaveAttribute("aria-current", "page");
  await touchDrag(page, { x: 60, y: 420 }, { x: 340, y: 425 });
  await expect(page).toHaveURL(/\/$/);
  await touchDrag(page, { x: 60, y: 420 }, { x: 340, y: 425 });
  await expect(page).toHaveURL(/\/history\/?$/);
  // past the last tab nothing happens
  await touchDrag(page, { x: 60, y: 420 }, { x: 340, y: 425 });
  await expect(page).toHaveURL(/\/history\/?$/);
  // a short drag snaps back
  await touchDrag(page, { x: 300, y: 420 }, { x: 250, y: 420 }, 4);
  await expect(page).toHaveURL(/\/history\/?$/);
  // browser / Android back returns to the previous tab
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("collected-total")).toBeVisible();

  // pull down from the top of the ledger opens the pay flow
  await page.evaluate(() => window.scrollTo(0, 0));
  await touchDrag(page, { x: 200, y: 250 }, { x: 205, y: 560 }, 16);
  const flow = page.getByTestId("pay-flow");
  await expect(flow).toBeVisible();
  await expect(flow.getByTestId("pay-as")).toContainText("You (Rohan)");
  await flow.getByTestId("pay-close").click();
  await expect(flow).toHaveCount(0);

  // a short pull does nothing
  await touchDrag(page, { x: 200, y: 250 }, { x: 200, y: 300 }, 6);
  await expect(page.getByTestId("pay-flow")).toHaveCount(0);
  await context.close();
});
