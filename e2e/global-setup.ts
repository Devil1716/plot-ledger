import { seedEmulator } from "../scripts/seed";

export default async function globalSetup(): Promise<void> {
  await seedEmulator({ withSamplePayments: false });
}
