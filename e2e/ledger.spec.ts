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

async function addPayment(page: Page, person: string, amount: string, date: string, note: string) {
  await page.getByTestId("add-payment").click();
  const flow = page.getByTestId("pay-flow");
  await expect(flow.getByRole("heading", { name: "Who paid?" })).toBeVisible();
  // the overlay must cover the screen (regression: it once rendered below the page)
  await expect(flow.getByRole("heading", { name: "Who paid?" })).toBeInViewport();
  await flow.getByRole("button", { name: new RegExp(`^${person.split(" · ")[0]},`) }).click();
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

test("admin records payments and a member sees the updated shares", async ({ browser }) => {
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD);

  await expect(adminPage.getByTestId("share-kavita")).toContainText("0.00%");
  await expect(adminPage.getByTestId("share-suresh")).toContainText("0.00%");

  await addPayment(adminPage, "Kavita Shah", "25,00,000", "2026-04-11", "Twenty-five lakh");
  await addPayment(adminPage, "Rohan Mehta", "75,00,000", "2026-05-02", "Rest of the contributor pool");
  await addPayment(adminPage, "Suresh Krishnan · Homeowner", "20,00,000", "2026-01-18", "Homeowner payment");

  await expect(adminPage.getByTestId("share-kavita")).toContainText("25.00%");
  await expect(adminPage.getByTestId("share-kavita")).toContainText("1,417.50");
  await expect(adminPage.getByTestId("share-rohan")).toContainText("75.00%");
  await expect(adminPage.getByTestId("share-suresh")).toContainText("0.00%");
  await expect(adminPage.getByTestId("share-suresh")).toContainText("₹20,00,000");
  await expect(adminPage.getByTestId("collected-total")).toContainText("₹1,20,00,000");
  await expect(adminPage.getByTestId("ownership-pool")).toContainText("₹1,00,00,000");

  await adminPage.getByTestId("nav-history").click();
  await expect(adminPage.getByTestId("history-list")).toContainText("Twenty-five lakh");
  await expect(adminPage.getByTestId("history-list")).toContainText("Homeowner payment");
  await expect(adminPage.getByTestId("audit-list")).toContainText("Ananya Iyer");

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, DEMO_MEMBER_EMAIL, DEMO_MEMBER_PASSWORD);
  await expect(memberPage.getByTestId("share-kavita")).toContainText("25.00%");
  await expect(memberPage.getByTestId("share-rohan")).toContainText("75.00%");
  await expect(memberPage.getByTestId("share-rohan")).toContainText("You");
  await expect(memberPage.getByTestId("share-suresh")).toContainText("0.00%");
  await expect(memberPage.getByTestId("add-payment")).toHaveCount(0);
  await memberPage.getByTestId("nav-history").click();
  await expect(memberPage.getByTestId("history-list")).toContainText("₹75,00,000");
  await expect(memberPage.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await memberContext.close();
  await adminContext.close();
});
