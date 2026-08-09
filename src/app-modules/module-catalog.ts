// The "App Store" catalog — every installable module ships in this same codebase (first-party
// only, no external code execution) and just stays dormant until an admin installs it here.
// Adding a new module = add a catalog entry + build its feature code gated behind
// `AppModulesService.isActive(key)`; nothing else in this file needs to change for the
// Settings > App Store page to pick it up (it renders straight off this array).
export type ModuleConfigFieldType = 'text' | 'password' | 'boolean' | 'select';

export type ModuleConfigField = {
  key: string;
  label: string;
  type: ModuleConfigFieldType;
  options?: string[];
  helpText?: string;
};

export type ModuleCatalogEntry = {
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  configFields: ModuleConfigField[];
};

export const MODULE_CATALOG: ModuleCatalogEntry[] = [
  {
    key: 'whatsapp-notifications',
    name: 'WhatsApp & SMS Notifications',
    description: 'Send order-confirmation, delivery, and low-stock alerts to customers and staff over WhatsApp or SMS via Twilio.',
    category: 'Communications',
    icon: '💬',
    version: '1.0.0',
    configFields: [
      { key: 'accountSid', label: 'Twilio Account SID', type: 'text' },
      { key: 'authToken', label: 'Twilio Auth Token', type: 'password' },
      { key: 'smsFromNumber', label: 'SMS From Number', type: 'text', helpText: 'e.g. +14155551234' },
      { key: 'whatsappFromNumber', label: 'WhatsApp From Number', type: 'text', helpText: 'e.g. +14155551234 (must be Twilio WhatsApp-enabled)' },
      { key: 'channel', label: 'Send Via', type: 'select', options: ['whatsapp', 'sms'] },
      { key: 'notifyOnOrderConfirmed', label: 'Notify customer when a Sales Order is confirmed', type: 'boolean' },
      { key: 'notifyOnDelivery', label: 'Notify customer when their order is delivered', type: 'boolean' },
      { key: 'notifyOnLowStock', label: 'Notify admin when a product drops below the low-stock threshold', type: 'boolean' },
      { key: 'lowStockThreshold', label: 'Low-stock threshold (units)', type: 'text', helpText: 'Default 20 if left blank' },
      { key: 'lowStockAdminPhone', label: 'Admin phone for low-stock alerts', type: 'text' },
    ],
  },
  {
    key: 'loyalty-rewards',
    name: 'Loyalty & Rewards',
    description: 'Customers earn points on every POS purchase and redeem them for a checkout discount — points are always computed from a ledger, never a mutable balance.',
    category: 'Sales & POS',
    icon: '🎁',
    version: '1.0.0',
    configFields: [
      { key: 'enableEarning', label: 'Earn points on POS sales', type: 'boolean' },
      { key: 'pointsPerCurrencyUnit', label: 'Points earned per unit', type: 'text', helpText: 'Default 1 if left blank' },
      { key: 'amountPerPoint', label: 'Currency spent per point (QAR)', type: 'text', helpText: 'e.g. 10 = 1 point per 10 QAR spent. Default 10 if left blank.' },
      { key: 'enableRedemption', label: 'Allow redeeming points at POS checkout', type: 'boolean' },
      { key: 'redemptionRate', label: 'Value per point when redeemed (QAR)', type: 'text', helpText: 'e.g. 0.10 = 1 point is worth QAR 0.10. Default 0.10 if left blank.' },
    ],
  },
  {
    key: 'barcode-label-printing',
    name: 'Barcode & Label Printing',
    description: 'Print product barcode labels for the warehouse or POS counter — pick a product, set the copy count, and print a ready-to-cut label sheet.',
    category: 'Inventory',
    icon: '🏷️',
    version: '1.0.0',
    configFields: [
      { key: 'labelWidthMm', label: 'Label width (mm)', type: 'text', helpText: 'Default 50 if left blank' },
      { key: 'labelHeightMm', label: 'Label height (mm)', type: 'text', helpText: 'Default 30 if left blank' },
      { key: 'barcodeSource', label: 'Barcode value source', type: 'select', options: ['barcodePcs', 'barcodeBox', 'sku'] },
      { key: 'showProductName', label: 'Show product name on label', type: 'boolean' },
      { key: 'showPrice', label: 'Show price on label', type: 'boolean' },
    ],
  },
  {
    key: 'vehicle-management',
    name: 'Vehicle Management',
    description: 'A registry of customer vehicles (plate, make/model, VIN) that Job Orders and future fleet features are built against.',
    category: 'Fleet',
    icon: '🚗',
    version: '1.0.0',
    configFields: [],
  },
  {
    key: 'job-order-management',
    name: 'Job Order',
    description: 'Fleet job cards — a job order against a vehicle with parts (deducted from inventory) and labor lines, a technician assignment, and an Open → In Progress → Completed workflow.',
    category: 'Fleet',
    icon: '🔧',
    version: '1.0.0',
    configFields: [
      { key: 'requireTechnician', label: 'Require a technician to be assigned before starting work', type: 'boolean' },
    ],
  },
  {
    key: 'crm-leads',
    name: 'CRM',
    description: 'A prospecting pipeline separate from your paying-customer directory — track leads through New → Contacted → Qualified → Won/Lost and convert a won lead into a real Customer.',
    category: 'Sales & CRM',
    icon: '📇',
    version: '1.0.0',
    configFields: [],
  },
  {
    key: 'appointments',
    name: 'Appointments',
    description: 'Schedule meetings, site visits, and calls against a Customer or Lead — assign staff, track Scheduled/Completed/Cancelled/No-show status, list and calendar views.',
    category: 'Sales & CRM',
    icon: '📅',
    version: '1.0.0',
    configFields: [],
  },
  {
    key: 'todo-list',
    name: 'Todo List',
    description: 'A shared, assignable task board — title, description, due date, priority, and status, assignable to any user.',
    category: 'Productivity',
    icon: '✅',
    version: '1.0.0',
    configFields: [],
  },
];

export function findCatalogEntry(key: string): ModuleCatalogEntry | undefined {
  return MODULE_CATALOG.find((m) => m.key === key);
}
