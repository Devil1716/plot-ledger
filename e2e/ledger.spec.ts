import { expect, test, type Page } from "@playwright/test";
const ADMIN = "Ananya (admin)";
const MEMBER = "Rohan (member)";
const NEWCOMER = "Neha (new, not approved)";

/** Google is the only sign-in; against the emulators the login page offers fake Google accounts. */
async function signIn(page: Page, account: string, expectLedger = true) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveCount(0);
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: account }).click();
  await expect(page.getByRole("heading", { name: "Who owns how much of the plot" })).toHaveCount(0);
  if (expectLedger) await expect(page.getByTestId("collected-total")).toBeVisible();
  // the post-sign-in entry animation is short and covers the screen while it plays
  await expect(page.getByTestId("entry-transition")).toHaveCount(0, { timeout: 5000 });
}

/** The ledger has no visible "Add payment" button (pull down instead); keyboard / screen readers use this. */
async function openPayByKeyboard(page: Page) {
  const button = page.getByTestId("add-payment");
  await expect(button).toHaveAccessibleName("Record a payment");
  await button.focus();
  await page.keyboard.press("Enter");
}

/** Records a payment for the signed-in person: there is no "who paid" picker any more. */
async function payForMyself(page: Page, firstName: string, amount: string, date: string, note: string) {
  await openPayByKeyboard(page);
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
  await signIn(adminPage, ADMIN);
  await expect(adminPage.getByTestId("share-ananya")).toContainText("0.00%");
  // the landing page carries no payment list and no visible "Add payment" button
  await expect(adminPage.getByTestId("recent-payments")).toHaveCount(0);
  await expect(adminPage.getByText("Recent payments")).toHaveCount(0);
  await expect(adminPage.getByRole("button", { name: "Add payment" })).toHaveCount(0);
  await expect(adminPage.getByRole("main").getByRole("link", { name: "History" })).toHaveCount(0);

  // the admin is linked to Ananya and can only record Ananya's money
  await payForMyself(adminPage, "Ananya", "25,00,000", "2026-04-11", "Twenty-five lakh");
  await expect(adminPage.getByTestId("share-ananya")).toContainText("100.00%");
  await expect(adminPage.getByTestId("share-ananya")).toContainText("₹25,00,000 paid");
  await expect(adminPage.getByText(/Land split|sq ft/)).toHaveCount(0);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, MEMBER);
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
  // admins delete only their own entries too
  await expect(adminPage.getByRole("button", { name: "Delete" })).toHaveCount(1);

  // the member removes their own payment (with a confirmation); the audit keeps the record
  await expect(memberPage.getByRole("button", { name: "Delete" })).toHaveCount(1);
  await memberPage.getByRole("button", { name: "Delete" }).click();
  await expect(memberPage.getByRole("heading", { name: "Delete this payment?" })).toBeVisible();
  await memberPage.getByRole("button", { name: "Delete payment" }).click();
  await expect(memberPage.getByTestId("history-list")).not.toContainText("Rest of the contributor pool");
  await expect(memberPage.getByTestId("audit-list")).toContainText("Removed");
  await expect(adminPage.getByTestId("history-list")).not.toContainText("Rest of the contributor pool");

  await memberContext.close();
  await adminContext.close();
});

test("a new Google account waits until the admin approves it", async ({ browser }) => {
  const newContext = await browser.newContext();
  const page = await newContext.newPage();
  await signIn(page, NEWCOMER, false);
  await expect(page.getByTestId("needs-link")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
  await expect(page.getByTestId("needs-link")).toContainText("newcomer@plotshare.local");
  // an admin already exists, so there is no claim button
  await expect(page.getByTestId("claim-admin")).toHaveCount(0);
  await expect(page.getByTestId("collected-total")).toHaveCount(0);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, ADMIN);
  await adminPage.getByTestId("nav-people").click();
  const pending = adminPage.getByTestId("pending-approvals");
  await expect(pending).toContainText("Neha Newcomer");
  await pending.getByRole("button", { name: "Approve" }).click();
  await expect(adminPage.getByTestId("pending-approvals")).toHaveCount(0);

  // the newcomer's screen opens the ledger by itself and she can pay only as herself
  await expect(page.getByTestId("collected-total")).toBeVisible();
  await openPayByKeyboard(page);
  await expect(page.getByTestId("pay-flow").getByTestId("pay-as")).toContainText("You (Neha)");
  await page.getByTestId("pay-flow").getByTestId("pay-close").click();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\/?$/);
  await adminContext.close();
  await newContext.close();
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
  await signIn(page, MEMBER);
  // the one-time hint: "Pull down to pay" shows on this first visit
  await expect(page.getByTestId("pull-handle")).toContainText("Pull down to pay");

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

  // after the first successful pull the hint is gone, and stays gone after a reload
  await expect(page.getByTestId("pull-handle")).toHaveCount(0);
  // a short pull does nothing
  await touchDrag(page, { x: 200, y: 250 }, { x: 200, y: 300 }, 6);
  await expect(page.getByTestId("pay-flow")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("collected-total")).toBeVisible();
  await expect(page.getByTestId("pull-handle")).toHaveCount(0);
  await context.close();
});

test("an admin makes another member an admin and can revoke it, but never the last admin", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, ADMIN);
  await page.getByTestId("nav-people").click();
  const admins = page.getByTestId("admins-section");
  await expect(admins).toBeVisible();
  // only admin: can't step down
  await expect(admins.getByRole("button", { name: "Step down" })).toBeDisabled();
  await expect(admins).toContainText("only admin");

  await admins.getByRole("button", { name: "Make admin" }).first().click();
  await page.getByTestId("confirm-admin-change").click();
  await expect(admins.getByRole("button", { name: "Remove admin" })).toHaveCount(1);
  await expect(admins.getByRole("button", { name: "Step down" })).toBeEnabled();

  await admins.getByRole("button", { name: "Remove admin" }).click();
  await expect(page.getByRole("heading", { name: /^Remove .* as admin\?$/ })).toBeVisible();
  await page.getByTestId("confirm-admin-change").click();
  await expect(admins.getByRole("button", { name: "Remove admin" })).toHaveCount(0);
  await expect(admins.getByRole("button", { name: "Step down" })).toBeDisabled();

  await page.getByTestId("nav-history").click();
  await expect(page.getByTestId("audit-list")).toContainText("an admin");
  await expect(page.getByTestId("audit-list")).toContainText("as admin");
  await context.close();
});
