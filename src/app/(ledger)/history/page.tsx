// The tab content lives in the shared (ledger) layout's swipe pager, which keeps
// History, Ledger and People mounted side by side; the route only selects the tab.
export default function TabRoute() {
  return <span hidden data-tab-route="history" />;
}
