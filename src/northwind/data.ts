// The Northwind sample data. Every person, email, and order here is fictional. The first three customers
// and orders are the originals from ccaf-study Build 01, unchanged, so its scenarios still work. The rest
// add cases: several orders per customer, refunds over the $500 limit, a shared name, a cancelled order,
// a customer with no orders, and one long order history that makes list_orders return a lot of tokens.
//
// Dates are stored as "days ago" and turned into timestamps when a backend is created, so the data reads
// the same whenever the page is opened.

export type StatusCode = 1 | 2 | 3 | 4; // 1 processing, 2 shipped, 3 delivered, 4 cancelled

export type CustomerRecord = { id: string; name: string; email: string };

export type OrderRecord = {
  id: string;
  customerId: string;
  item: string;
  total: number;
  statusCode: StatusCode;
  /** Days before "now" that the order was delivered; null if it hasn't been. */
  deliveredDaysAgo: number | null;
  warehouseBin: string; // noise the agent never needs
  carrierRouteCode: string; // more noise
};

export const STATUS_LABELS: Record<StatusCode, string> = {
  1: "processing",
  2: "shipped",
  3: "delivered",
  4: "cancelled",
};

export const CUSTOMERS: CustomerRecord[] = [
  // From Build 01.
  { id: "C-1001", name: "Dana Whitfield", email: "dana@example.com" },
  { id: "C-1002", name: "Dana Whitfield", email: "dwhitfield@example.com" },
  { id: "C-1003", name: "Marcus Oyelaran", email: "marcus@example.com" },
  // Added.
  { id: "C-1004", name: "Priya Raman", email: "priya@example.com" },
  { id: "C-1005", name: "Jordan Ellis", email: "jordan.ellis@example.com" },
  { id: "C-1006", name: "Jordan Ellis", email: "jellis@example.com" },
  { id: "C-1007", name: "Sofia Marquez", email: "sofia@example.com" },
  { id: "C-1008", name: "Wei Chen", email: "wei.chen@example.com" },
  { id: "C-1009", name: "Amara Okafor", email: "amara@example.com" },
  { id: "C-1010", name: "Liam Novak", email: "liam@example.com" },
];

const order = (
  id: string,
  customerId: string,
  item: string,
  total: number,
  statusCode: StatusCode,
  deliveredDaysAgo: number | null,
  warehouseBin: string,
  carrierRouteCode: string,
): OrderRecord => ({ id, customerId, item, total, statusCode, deliveredDaysAgo, warehouseBin, carrierRouteCode });

export const ORDERS: OrderRecord[] = [
  // From Build 01.
  order("ORD-5001", "C-1001", "Trail headlamp", 48, 3, 12, "A-14", "RX-22"),
  order("ORD-5002", "C-1003", "Four-season tent", 729, 3, 8, "D-02", "RX-31"),
  order("ORD-5003", "C-1003", "Camp stove", 89.5, 2, null, "B-07", "RX-09"),
  // Dana Whitfield (dwhitfield@): the other Dana, so a name-only lookup is ambiguous.
  order("ORD-5004", "C-1002", "Insulated water bottle", 32, 3, 20, "A-03", "RX-14"),
  // Priya Raman: one order in each state.
  order("ORD-5005", "C-1004", "Down sleeping bag", 189, 3, 6, "C-11", "RX-22"),
  order("ORD-5006", "C-1004", "Trekking poles", 74.99, 2, null, "B-15", "RX-08"),
  order("ORD-5007", "C-1004", "65L backpack", 249, 1, null, "D-09", "RX-31"),
  // Jordan Ellis (jordan.ellis@): a refund over $500 has to be escalated.
  order("ORD-5008", "C-1005", "Touring kayak", 1249, 3, 4, "E-01", "RX-40"),
  order("ORD-5009", "C-1005", "Carbon paddle", 139, 3, 4, "E-02", "RX-40"),
  // Jordan Ellis (jellis@): same name, different person.
  order("ORD-5010", "C-1006", "Bear canister", 79.95, 3, 15, "C-04", "RX-17"),
  // Sofia Marquez: an older delivery and an exactly-$500 order (the refund limit is "over $500").
  order("ORD-5011", "C-1007", "Rain shell jacket", 159, 3, 45, "B-02", "RX-12"),
  order("ORD-5012", "C-1007", "Ultralight tent", 500, 3, 10, "D-05", "RX-31"),
  order("ORD-5013", "C-1007", "Camp chair", 65, 3, 10, "A-21", "RX-31"),
  // Wei Chen: a cancelled order, which can't be refunded.
  order("ORD-5014", "C-1008", "GPS watch", 399, 4, null, "F-01", "RX-05"),
  order("ORD-5015", "C-1008", "Merino base layer", 85, 3, 3, "B-19", "RX-05"),
  // Amara Okafor: a long history. Listing it adds a lot of tokens to every later request.
  order("ORD-5016", "C-1009", "Climbing harness", 74.95, 3, 120, "G-02", "RX-50"),
  order("ORD-5017", "C-1009", "Belay device", 29.95, 3, 120, "G-03", "RX-50"),
  order("ORD-5018", "C-1009", "Climbing shoes", 159, 3, 95, "G-07", "RX-50"),
  order("ORD-5019", "C-1009", "Chalk bag", 22, 3, 95, "G-08", "RX-50"),
  order("ORD-5020", "C-1009", "Dynamic rope, 60 m", 219, 3, 60, "G-11", "RX-51"),
  order("ORD-5021", "C-1009", "Quickdraw set", 129, 3, 60, "G-12", "RX-51"),
  order("ORD-5022", "C-1009", "Helmet", 69.95, 3, 25, "G-14", "RX-51"),
  order("ORD-5023", "C-1009", "Approach shoes", 139, 3, 9, "G-16", "RX-52"),
  order("ORD-5024", "C-1009", "Crash pad", 229, 2, null, "G-20", "RX-52"),
  order("ORD-5025", "C-1009", "Hangboard", 99, 1, null, "G-22", "RX-52"),
  // Liam Novak has no orders, so list_orders returns an empty list (a successful search, not an error).
];
